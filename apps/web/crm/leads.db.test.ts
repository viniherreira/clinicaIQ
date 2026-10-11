import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Leads e tarefas contra o banco de desenvolvimento, numa clínica descartável.
 * Pulado onde não há banco.
 */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('leads e tarefas (banco)', async () => {
  const { prisma, getTenantClient, encrypt } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead, moveLead, setTags, linkPatient, addNote } = await import('./leads');
  const { createTask, completeTask } = await import('./tasks');
  const { findOpenLeadByPhone, findPatientByPhone } = await import('./duplicates');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `leads_${suffix}`, name: 'Leads teste', slug: `leads-${suffix}` },
  });
  const user = await prisma.user.create({
    data: { tenantId: tenant.id, name: 'Recepção', email: `r-${suffix}@teste.local`, role: 'RECEPTIONIST' },
  });
  const db = getTenantClient(tenant.id);
  const actor = { tenantId: tenant.id, userId: user.id };
  await ensureDefaultPipeline(db, tenant.id);
  const stages = await db.pipelineStage.findMany();
  const byRole = (r: string) => stages.find((s) => s.role === r)!;
  const conversa = stages.find((s) => s.name === 'Em conversa')!;

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.patient.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('cria no topo de Novo, com o telefone cifrado e o responsável padrão', async () => {
    const a = await createLead(db, actor, { name: 'Ana', phone: '(11) 98765-0001' });
    const b = await createLead(db, actor, { name: 'Bia', phone: '(11) 98765-0002' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const coluna = await db.lead.findMany({ where: { stageId: byRole('NEW').id }, orderBy: { position: 'asc' } });
    expect(coluna.map((l) => l.name)).toEqual(['Bia', 'Ana']);
    expect(coluna[0].phoneEncrypted).not.toContain('98765');
    expect(coluna[0].assignedToId).toBe(user.id);
    expect(await db.leadActivity.count({ where: { leadId: a.leadId, type: 'CREATED' } })).toBe(1);
  });

  it('acha duplicado aberto pelo telefone, digitado de outro jeito', async () => {
    expect(await findOpenLeadByPhone(db, tenant.id, '11987650001')).toMatchObject({ name: 'Ana' });
    expect(await findOpenLeadByPhone(db, tenant.id, '11999999999')).toBeNull();
  });

  it('perder exige motivo; reabrir volta para a coluna e o duplicado reaparece', async () => {
    const ana = (await findOpenLeadByPhone(db, tenant.id, '11987650001'))!;
    const motivo = (await db.lostReason.findFirst())!;

    expect(await moveLead(db, actor, ana.id, { stageId: byRole('LOST').id })).toMatchObject({ ok: false });
    expect(await moveLead(db, actor, ana.id, { stageId: byRole('LOST').id, lostReasonId: motivo.id })).toEqual({ ok: true });
    expect(await findOpenLeadByPhone(db, tenant.id, '11987650001')).toBeNull();

    expect(await moveLead(db, actor, ana.id, { stageId: conversa.id })).toEqual({ ok: true });
    const reaberta = (await db.lead.findFirst({ where: { id: ana.id } }))!;
    expect(reaberta).toMatchObject({ lostAt: null, lostReasonId: null, stageId: conversa.id });
    expect(await db.leadActivity.count({ where: { leadId: ana.id, type: 'REOPENED' } })).toBe(1);
  });

  it('a mesma pessoa pode ter um negócio novo depois de fechar o primeiro', async () => {
    const ana = (await findOpenLeadByPhone(db, tenant.id, '11987650001'))!;
    await moveLead(db, actor, ana.id, { stageId: byRole('WON').id });
    const novo = await createLead(db, actor, { name: 'Ana', phone: '11987650001', title: 'Harmonização' });
    expect(novo.ok).toBe(true);
    expect(await db.lead.count({ where: { phoneHash: (await db.lead.findFirst({ where: { id: ana.id } }))!.phoneHash } })).toBe(2);
  });

  it('tags: troca a lista e registra o que entrou e saiu', async () => {
    const bia = (await findOpenLeadByPhone(db, tenant.id, '11987650002'))!;
    const [t1, t2] = await Promise.all([
      db.leadTag.create({ data: { tenantId: tenant.id, name: 'implante', color: 'violet' } }),
      db.leadTag.create({ data: { tenantId: tenant.id, name: 'urgente', color: 'amber' } }),
    ]);
    await setTags(db, actor, bia.id, [t1.id, t2.id]);
    await setTags(db, actor, bia.id, [t2.id, 'tag-de-outra-clinica']);
    const agora = await db.leadTagOnLead.findMany({ where: { leadId: bia.id } });
    expect(agora.map((t) => t.tagId)).toEqual([t2.id]);
    expect(await db.leadActivity.count({ where: { leadId: bia.id, type: 'TAG_REMOVED' } })).toBe(1);
  });

  it('tarefas: cria para o responsável, conclui uma vez só', async () => {
    const bia = (await findOpenLeadByPhone(db, tenant.id, '11987650002'))!;
    const t = await createTask(db, actor, bia.id, { text: 'Ligar', dueAt: new Date(Date.now() + 3_600_000) });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect((await db.leadTask.findFirst({ where: { id: t.taskId } }))?.assignedToId).toBe(user.id);
    expect(await createTask(db, actor, bia.id, { text: '   ', dueAt: new Date() })).toMatchObject({ ok: false });

    await completeTask(db, actor, t.taskId);
    await completeTask(db, actor, t.taskId);
    expect(await db.leadActivity.count({ where: { leadId: bia.id, type: 'TASK_COMPLETED' } })).toBe(1);
  });

  it('acha paciente pelo telefone e liga o lead a ele', async () => {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY!;
    const paciente = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        controlNumber: 1,
        name: 'Bia Souza',
        phoneEncrypted: encrypt('(11) 98765-0002', masterKey, tenant.id),
        lgpdConsentAt: new Date(),
      },
    });
    expect(await findPatientByPhone(db, tenant.id, '5511987650002')).toMatchObject({ id: paciente.id });

    const bia = (await findOpenLeadByPhone(db, tenant.id, '11987650002'))!;
    expect(await linkPatient(db, actor, bia.id, paciente.id, 'linked')).toEqual({ ok: true });
    expect((await db.lead.findFirst({ where: { id: bia.id } }))).toMatchObject({ patientId: paciente.id, name: 'Bia Souza' });
    expect(await addNote(db, actor, bia.id, 'quer parcelar')).toEqual({ ok: true });
  });
});
