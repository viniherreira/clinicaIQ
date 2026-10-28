import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ROLE_RIGHTS } from '@/lib/crm-rights';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('ações em massa (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead } = await import('./leads');
  const { parseFilters } = await import('./filters');
  const { resolveTargets, runBulk, bulkSummary } = await import('./bulk');

  const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `bk_${s}`, name: 'Massa', slug: `massa-${s}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Rita', email: `r-${s}@teste.local`, role: 'OWNER' } });
  const outra = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Bia', email: `b-${s}@teste.local`, role: 'RECEPTIONIST' } });
  const db = getTenantClient(tenant.id);
  const ctx = { db, tenantId: tenant.id, userId: user.id, role: 'OWNER' as const, crmRole: 'MANAGER' as const, rights: ROLE_RIGHTS.MANAGER, manager: true, ownOnly: false };
  await ensureDefaultPipeline(db, tenant.id);
  const etapas = await db.pipelineStage.findMany({ orderBy: { order: 'asc' } });
  const novo = etapas.find((e) => e.role === 'NEW')!;
  const conversa = etapas.find((e) => e.name === 'Em conversa')!;
  const perdeu = etapas.find((e) => e.role === 'LOST')!;
  const tag = await db.leadTag.create({ data: { tenantId: tenant.id, name: 'implante', color: 'blue' } });
  const campo = await db.leadField.create({ data: { tenantId: tenant.id, name: 'Convênio', type: 'SELECT', options: ['Amil'] } });
  const motivo = await db.lostReason.create({ data: { tenantId: tenant.id, name: 'Preço', order: 99 } });
  // Automação na etapa "Em conversa": mover em massa não pode disparar sem pedir.
  await db.stageAutomation.create({ data: { tenantId: tenant.id, stageId: conversa.id, action: 'ADD_TAG', config: { tagId: tag.id } } });

  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await createLead(db, { tenantId: tenant.id, userId: user.id }, { name: `Lead ${i}`, phone: `11 97777-00${10 + i}` });
    if (!r.ok) throw new Error(r.message);
    ids.push(r.leadId);
  }

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.automationRun.deleteMany({ where: t });
    await prisma.stageAutomation.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.leadField.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('mover em massa: sem automação por padrão, com quando pedido; coluna renumerada uma vez', async () => {
    const r1 = await runBulk(ctx, ids.slice(0, 2), { type: 'move', stageId: conversa.id, runAutomations: false });
    expect(r1).toEqual({ done: 2, failed: [] });
    expect(await db.automationRun.count({ where: { leadId: { in: ids.slice(0, 2) } } })).toBe(0);
    const r2 = await runBulk(ctx, [ids[2]], { type: 'move', stageId: conversa.id, runAutomations: true });
    expect(r2.done).toBe(1);
    expect(await db.automationRun.count({ where: { leadId: ids[2] } })).toBe(1);
    const posicoes = (await db.lead.findMany({ where: { stageId: conversa.id }, select: { position: true } })).map((l) => l.position).sort();
    expect(posicoes).toEqual([0, 1, 2]);
  });

  it('tag, responsável, campo e tarefa em vários; histórico em cada um', async () => {
    expect((await runBulk(ctx, ids, { type: 'addTag', tagId: tag.id })).done).toBe(5);
    expect((await runBulk(ctx, ids.slice(0, 1), { type: 'removeTag', tagId: tag.id })).done).toBe(1);
    expect(await db.leadTagOnLead.count({ where: { tagId: tag.id } })).toBe(4);
    expect((await runBulk(ctx, ids, { type: 'assign', userId: outra.id })).done).toBe(5);
    expect(await db.lead.count({ where: { assignedToId: outra.id } })).toBe(5);
    expect((await runBulk(ctx, ids, { type: 'field', fieldId: campo.id, value: 'amil' })).done).toBe(5);
    const r = await runBulk(ctx, ids, { type: 'field', fieldId: campo.id, value: 'Bradesco' });
    expect(r.done).toBe(0);
    expect(bulkSummary(r.done, r.failed, 'atualizados')).toBe('0 atualizados; 5 não: convênio: "bradesco" não é uma das opções (5).');
    expect((await runBulk(ctx, ids.slice(0, 2), { type: 'task', text: 'Ligar', dueAt: new Date(Date.now() + 3600_000), assignedToId: null })).done).toBe(2);
    expect(await db.leadActivity.count({ where: { leadId: ids[0], type: 'FIELD_CHANGED' } })).toBe(1);
  });

  it('"todos os do filtro" usa a mesma busca da lista', async () => {
    const naConversa = await resolveTargets(ctx, { filters: { ...parseFilters({}), etapa: conversa.id }, status: 'abertos' });
    expect(naConversa.sort()).toEqual(ids.slice(0, 3).sort());
    const comTag = await resolveTargets(ctx, { filters: parseFilters({ tag: tag.id }), status: 'abertos' });
    expect(comTag.length).toBe(4);
    // Ids de fora da clínica (ou inventados) somem.
    expect(await resolveTargets(ctx, { ids: [ids[0], 'naoexiste123'] })).toEqual([ids[0]]);
  });

  it('perder vai para o Perdeu do funil, com motivo; excluir tira da busca', async () => {
    expect((await runBulk(ctx, [ids[3]], { type: 'lose', lostReasonId: motivo.id })).done).toBe(1);
    const perdido = await db.lead.findFirst({ where: { id: ids[3] } });
    expect(perdido).toMatchObject({ stageId: perdeu.id, lostReasonId: motivo.id });
    expect(perdido?.lostAt).not.toBeNull();
    expect((await runBulk(ctx, [ids[4]], { type: 'delete' })).done).toBe(1);
    expect(await resolveTargets(ctx, { ids: [ids[4]] })).toEqual([]);
    expect(novo).toBeTruthy();
  });
});
