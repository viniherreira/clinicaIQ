import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('Painel de desempenho (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead, moveLead } = await import('./leads');
  const { ingestChat } = await import('./chat-ingest');
  const { loadPerformance } = await import('./performance');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `perf_${suffix}`, name: 'Painel', slug: `perf-${suffix}`, settings: { crm: { autoTags: false, metaEvents: false } } },
  });
  const outra = await prisma.tenant.create({ data: { clerkOrgId: `perf2_${suffix}`, name: 'Outra', slug: `perf2-${suffix}` } });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  await ensureDefaultPipeline(getTenantClient(outra.id), outra.id);
  const pessoa = (nome: string) =>
    prisma.user.create({ data: { tenantId: tenant.id, clerkUserId: `${nome}_${suffix}`, email: `${nome}_${suffix}@teste.dev`, name: nome, role: 'RECEPTIONIST' } });
  const [ana, bia] = [await pessoa('Ana'), await pessoa('Bia')];
  const etapas = (await db.pipelineStage.findMany({ orderBy: { order: 'asc' } })).map((s) => ({ id: s.id, name: s.name, color: s.color, role: s.role, pipelineId: s.pipelineId }));
  const colunas = etapas.filter((s) => s.role !== 'WON' && s.role !== 'LOST');
  const etapa = (role: string) => etapas.find((s) => s.role === role)!.id;
  const equipe = [
    { id: ana.id, name: 'Ana' },
    { id: bia.id, name: 'Bia' },
  ];
  const como = (userId: string) => ({ tenantId: tenant.id, userId });

  let n = 0;
  async function lead(dono: string, source: 'INSTAGRAM' | 'WHATSAPP', valor?: number) {
    const r = await createLead(db, como(dono), { name: `Lead ${n}`, phone: `11 96${String(1000000 + n++)}`, source, assignedToId: dono, estimatedValueCents: valor ?? null });
    if (!r.ok) throw new Error(r.message);
    return r.leadId;
  }

  // Ana: 2 do Instagram (um agenda e fecha por R$ 3.000; outro agenda e é perdido). Bia: 1 do WhatsApp, parado em Novo.
  const fechou = await lead(ana.id, 'INSTAGRAM', 300000);
  const perdeu = await lead(ana.id, 'INSTAGRAM');
  await lead(bia.id, 'WHATSAPP');
  for (const id of [fechou, perdeu]) await moveLead(db, como(ana.id), id, { stageId: etapa('SCHEDULED') });
  await moveLead(db, como(ana.id), fechou, { stageId: etapa('WON') });
  const motivo = await db.lostReason.findFirst();
  await moveLead(db, como(ana.id), perdeu, { stageId: etapa('LOST'), lostReasonId: motivo!.id });
  // Um lead de outra clínica não pode aparecer.
  const dbOutra = getTenantClient(outra.id);
  await createLead(dbOutra, { tenantId: outra.id, userId: null }, { name: 'De fora', phone: '11 95555-0000', source: 'SITE' });

  // Uma conversa: a pessoa escreve e a Ana responde 6 minutos depois.
  const base = Date.now() - 60 * 60_000;
  const chat = (min: number, direction: 'INBOUND' | 'OUTBOUND', origin: 'CONTACT' | 'PHONE') =>
    ingestChat(tenant.id, { externalId: `PF${suffix}${min}`, direction, origin, phone: '11 96100-0000', contactName: 'Li', kind: 'TEXT', text: 'oi', at: new Date(base + min * 60_000) });
  const primeira = await chat(0, 'INBOUND', 'CONTACT');
  const resposta = await chat(6, 'OUTBOUND', 'PHONE');
  if (!primeira.recorded || !resposta.recorded) throw new Error('não gravou');
  await prisma.chatMessage.update({ where: { id: resposta.messageId }, data: { sentById: ana.id, origin: 'CRM' } });

  afterAll(async () => {
    for (const id of [tenant.id, outra.id]) {
      const t = { tenantId: id };
      await prisma.chatMessage.deleteMany({ where: t });
      await prisma.conversation.deleteMany({ where: t });
      await prisma.automationRun.deleteMany({ where: t });
      await prisma.stageAutomation.deleteMany({ where: t });
      await prisma.leadTask.deleteMany({ where: t });
      await prisma.leadTagOnLead.deleteMany({ where: t });
      await prisma.leadTag.deleteMany({ where: t });
      await prisma.leadActivity.deleteMany({ where: t });
      await prisma.lead.deleteMany({ where: t });
      await prisma.lostReason.deleteMany({ where: t });
      await prisma.pipelineStage.deleteMany({ where: t });
      await prisma.pipeline.deleteMany({ where: t });
      await prisma.user.deleteMany({ where: t });
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('gestor: os números da clínica inteira', async () => {
    const d = await loadPerformance({ tenantId: tenant.id, userId: ana.id, ownOnly: false, db }, '7d', colunas, equipe);
    expect(d.kpis.newLeads.value).toBe(3);
    // 2 de 3 agendaram; dos 2, 1 fechou.
    expect(d.kpis.leadToScheduled.value).toBeCloseTo(2 / 3);
    expect(d.kpis.scheduledToWon.value).toBeCloseTo(0.5);
    expect(d.kpis.revenueCents.value).toBe(300000);
    expect(d.kpis.won).toBe(1);
    expect(d.kpis.responseMinutes.value).toBe(6);
    expect(d.kpis.openLeads).toBe(1);
    // Sem período anterior: não inventa variação.
    expect(d.kpis.newLeads.change).toBeNull();

    expect(d.arrivals.total).toBe(3);
    expect(d.arrivals.peak?.n).toBe(3);
    expect(d.arrivals.days).toBe(90);
    expect(d.months).toHaveLength(12);
    expect(d.months.at(-1)).toMatchObject({ leads: 3, won: 1 });
    expect(d.sources).toEqual([
      { label: 'Instagram', leads: 2, won: 1 },
      { label: 'WhatsApp', leads: 1, won: 0 },
    ]);

    // Pode haver mais de um funil com etapas do mesmo papel: soma por papel.
    const porPapel = (role: string) =>
      d.stages
        .filter((s) => etapas.find((e) => e.id === s.id)!.role === role)
        .reduce((t, s) => ({ reached: t.reached + s.reached, lostHere: t.lostHere + s.lostHere }), { reached: 0, lostHere: 0 });
    expect(porPapel('NEW').reached).toBe(3);
    expect(porPapel('SCHEDULED')).toEqual({ reached: 2, lostHere: 1 });
    expect(d.lostReasons).toEqual([{ label: motivo!.name, count: 1 }]);

    expect(d.team).toEqual([{ id: ana.id, name: 'Ana', attended: 1, scheduled: 2, won: 1, revenueCents: 300000, responseMinutes: 6 }]);
  });

  it('quem vê só os dele recebe só os próprios números', async () => {
    const d = await loadPerformance({ tenantId: tenant.id, userId: bia.id, ownOnly: true, db }, '7d', colunas, equipe);
    expect(d.kpis.newLeads.value).toBe(1);
    expect(d.kpis.revenueCents.value).toBe(0);
    expect(d.kpis.leadToScheduled.value).toBe(0);
    expect(d.sources).toEqual([{ label: 'WhatsApp', leads: 1, won: 0 }]);
    expect(d.lostReasons).toEqual([]);
    expect(d.team.map((p) => p.name)).toEqual(['Bia']);
    expect(d.team[0]).toMatchObject({ attended: 0, won: 0 });
  });

  it('outra clínica não enxerga nada daqui', async () => {
    const d = await loadPerformance({ tenantId: outra.id, userId: 'x', ownOnly: false, db: dbOutra }, '7d', [], []);
    expect(d.kpis.newLeads.value).toBe(1);
    expect(d.kpis.revenueCents.value).toBe(0);
    expect(d.sources).toEqual([{ label: 'Site', leads: 1, won: 0 }]);
  });
});
