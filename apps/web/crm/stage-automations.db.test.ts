import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe('automações: configuração', async () => {
  const { parseConfig } = await import('./stage-automations');
  it.each([
    ['SEND_MESSAGE', {}, false],
    ['SEND_MESSAGE', { text: ' Oi {nome} ' }, true],
    ['CREATE_TASK', { text: 'Ligar', dueHours: -1 }, false],
    ['CREATE_TASK', { text: 'Ligar', dueHours: 24 }, true],
    ['ADD_TAG', { tagId: '' }, false],
    ['ASSIGN_USER', { userId: 'u1' }, true],
  ] as const)('%s %j', (action, config, ok) => {
    expect(parseConfig(action, config).ok).toBe(ok);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('automações por etapa (banco)', async () => {
  const { prisma, getTenantClient, decrypt } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead, moveLead } = await import('./leads');
  const a = await import('./stage-automations');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `auto_${suffix}`, name: 'Automação', slug: `auto-${suffix}` } });
  const dona = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `d-${suffix}@teste.local`, role: 'OWNER' } });
  const rita = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Rita', email: `r-${suffix}@teste.local`, role: 'RECEPTIONIST' } });
  const db = getTenantClient(tenant.id);
  const actor = { tenantId: tenant.id, userId: dona.id };
  await ensureDefaultPipeline(db, tenant.id);
  const stage = async (role: string) => (await db.pipelineStage.findFirst({ where: { role: role as never } }))!;
  const novo = await stage('NEW');
  const agendada = await stage('SCHEDULED');
  const tag = await db.leadTag.create({ data: { tenantId: tenant.id, name: 'boas-vindas', color: 'blue' } });

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.automationRun.deleteMany({ where: t });
    await prisma.stageAutomation.deleteMany({ where: t });
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('cadastro confere o que a automação aponta', async () => {
    expect((await a.saveAutomation(db, tenant.id, { stageId: novo.id, action: 'ADD_TAG', config: { tagId: 'de-outra-clinica' }, delayMinutes: 0 })).ok).toBe(false);
    for (const [action, config, delayMinutes] of [
      ['SEND_MESSAGE', { text: 'Oi {nome}! Recebemos seu contato e já te respondemos.' }, 0],
      ['ADD_TAG', { tagId: tag.id }, 0],
      ['ASSIGN_USER', { userId: rita.id }, 0],
      ['CREATE_TASK', { text: 'Ligar para {nome}', dueHours: 2, assignTo: 'responsible' }, 60],
    ] as const) {
      expect(await a.saveAutomation(db, tenant.id, { stageId: novo.id, action, config, delayMinutes })).toEqual({ ok: true });
    }
  });

  it('lead novo: o que é "na hora" roda já; o atrasado espera a hora', async () => {
    const r = await createLead(db, actor, { name: 'Ana Souza', phone: '11 97777-0001' });
    if (!r.ok) throw new Error(r.message);
    expect(await db.automationRun.count({ where: { leadId: r.leadId } })).toBe(4);

    expect(await a.runDueAutomations(new Date(), { tenantId: tenant.id })).toBe(3);
    const lead = await db.lead.findFirst({ where: { id: r.leadId }, include: { tags: true, tasks: true } });
    expect(lead?.assignedToId).toBe(rita.id);
    expect(lead?.tags.map((t) => t.tagId)).toEqual([tag.id]);
    expect(lead?.tasks).toHaveLength(0);

    const msg = await db.chatMessage.findFirst({ where: { conversation: { leadId: r.leadId } } });
    expect(msg).toMatchObject({ origin: 'BOT', status: 'PENDING' });
    expect(decrypt(msg!.textEncrypted!, key, tenant.id)).toBe('Oi Ana! Recebemos seu contato e já te respondemos.');

    // Uma hora depois: a tarefa, para a responsável (Rita, trocada pela automação).
    expect(await a.runDueAutomations(new Date(Date.now() + 61 * 60_000), { tenantId: tenant.id })).toBe(1);
    const tarefa = await db.leadTask.findFirst({ where: { leadId: r.leadId } });
    expect(tarefa).toMatchObject({ text: 'Ligar para Ana', origin: 'AUTOMATION', assignedToId: rita.id });
  });

  it('saiu da etapa antes da hora: o atrasado não roda', async () => {
    const r = await createLead(db, actor, { name: 'Bia Lima', phone: '11 97777-0002' });
    if (!r.ok) throw new Error(r.message);
    await a.runDueAutomations(new Date(), { tenantId: tenant.id });
    await moveLead(db, actor, r.leadId, { stageId: agendada.id });
    expect(await a.runDueAutomations(new Date(Date.now() + 61 * 60_000), { tenantId: tenant.id })).toBe(0);
    const tarefa = await db.automationRun.findFirst({ where: { leadId: r.leadId, automation: { action: 'CREATE_TASK' } } });
    expect(tarefa).toMatchObject({ status: 'SKIPPED' });
  });

  it('quem pediu para sair não recebe a mensagem', async () => {
    const r = await createLead(db, actor, { name: 'Carla Dias', phone: '11 97777-0003' });
    if (!r.ok) throw new Error(r.message);
    await db.lead.updateMany({ where: { id: r.leadId }, data: { whatsappOptOut: true } });
    await a.runDueAutomations(new Date(), { tenantId: tenant.id });
    const run = await db.automationRun.findFirst({ where: { leadId: r.leadId, automation: { action: 'SEND_MESSAGE' } } });
    expect(run).toMatchObject({ status: 'SKIPPED', error: 'Pediu para não receber mensagens.' });
  });

  it('automação desligada não agenda; rodar de novo não repete', async () => {
    const autos = await db.stageAutomation.findMany({ where: { stageId: novo.id } });
    for (const x of autos) await a.toggleAutomation(db, x.id, false);
    const r = await createLead(db, actor, { name: 'Dani', phone: '11 97777-0004' });
    if (!r.ok) throw new Error(r.message);
    expect(await db.automationRun.count({ where: { leadId: r.leadId } })).toBe(0);
    expect(await a.runDueAutomations(new Date(), { tenantId: tenant.id })).toBe(0);
  });
});
