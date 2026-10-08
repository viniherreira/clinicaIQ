import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * A integração automática de ponta a ponta contra o banco de desenvolvimento:
 * agenda e orçamentos de verdade numa clínica descartável. Pulado sem banco.
 */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('notifyCrm (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead } = await import('./leads');
  const { notifyCrm } = await import('./notify');
  const { TASK_REAGENDAR } = await import('./automation');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `notify_${suffix}`, name: 'Notify teste', slug: `notify-${suffix}` },
  });
  await prisma.subscription.create({
    data: { tenantId: tenant.id, tier: 'CLINICA', status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01'), crmEnabled: true },
  });
  const dono = await prisma.user.create({
    data: { tenantId: tenant.id, name: 'Dono', email: `d-${suffix}@teste.local`, role: 'OWNER' },
  });
  const profissional = await prisma.professional.create({ data: { tenantId: tenant.id, name: 'Dra. Teste' } });
  const paciente = await prisma.patient.create({
    data: { tenantId: tenant.id, controlNumber: 1, name: 'Carla', phoneEncrypted: 'x', lgpdConsentAt: new Date() },
  });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  const lead = await createLead(db, { tenantId: tenant.id, userId: dono.id }, {
    name: 'Carla',
    phone: '11987650099',
    patientId: paciente.id,
  });
  if (!lead.ok) throw new Error(lead.message);
  const leadId = lead.leadId;

  const etapa = async () => {
    const l = await db.lead.findFirst({ where: { id: leadId }, include: { stage: true } });
    return { nome: l!.stage.name, valor: l!.estimatedValueCents, ganho: Boolean(l!.wonAt) };
  };
  const emDias = (d: number) => new Date(Date.now() + d * 86_400_000);

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.quoteItem.deleteMany({ where: { quote: t } });
    await prisma.quote.deleteMany({ where: t });
    await prisma.appointment.deleteMany({ where: t });
    await prisma.patient.deleteMany({ where: t });
    await prisma.professional.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.subscription.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  let consulta: { id: string };

  it('agendou → Avaliação agendada', async () => {
    consulta = await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        patientId: paciente.id,
        professionalId: profissional.id,
        startTime: emDias(3),
        endTime: emDias(3.02),
      },
    });
    await notifyCrm(tenant.id, { type: 'appointment.created', patientId: paciente.id, appointmentId: consulta.id });
    expect((await etapa()).nome).toBe('Avaliação agendada');
  });

  it('cancelou → volta para Em conversa com "Reagendar avaliação", sem duplicar a tarefa', async () => {
    await prisma.appointment.update({ where: { id: consulta.id }, data: { status: 'CANCELLED' } });
    const ev = { type: 'appointment.cancelled', patientId: paciente.id, appointmentId: consulta.id } as const;
    await notifyCrm(tenant.id, ev);
    await notifyCrm(tenant.id, ev);

    expect((await etapa()).nome).toBe('Em conversa');
    const tarefas = await db.leadTask.findMany({ where: { leadId, completedAt: null } });
    expect(tarefas.map((t) => t.text)).toEqual([TASK_REAGENDAR]);
    expect(tarefas[0]).toMatchObject({ origin: 'AUTOMATION', assignedToId: dono.id });
    expect(tarefas[0].dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  let orcamento: { id: string };

  it('orçamento criado → Em negociação; aprovado → Fechou com o valor', async () => {
    orcamento = await prisma.quote.create({
      data: {
        tenantId: tenant.id,
        patientId: paciente.id,
        number: 1,
        publicToken: `tok-${suffix}`,
        subtotal: 6500,
        total: 6500,
        validUntil: emDias(30),
      },
    });
    await notifyCrm(tenant.id, { type: 'quote.created', patientId: paciente.id, quoteId: orcamento.id });
    expect((await etapa()).nome).toBe('Em negociação');

    await prisma.quote.update({ where: { id: orcamento.id }, data: { status: 'ACCEPTED' } });
    await notifyCrm(tenant.id, { type: 'quote.accepted', patientId: paciente.id, quoteId: orcamento.id, totalCents: 650_000 });
    expect(await etapa()).toEqual({ nome: 'Fechou', valor: 650_000, ganho: true });
  });

  it('reabrir o orçamento que ganhou → volta para Em negociação', async () => {
    await notifyCrm(tenant.id, { type: 'quote.reopened', patientId: paciente.id, quoteId: orcamento.id });
    expect(await etapa()).toMatchObject({ nome: 'Em negociação', ganho: false });
  });

  it('tudo ficou no histórico, com a automação como autora', async () => {
    const eventos = await db.leadActivity.findMany({ where: { leadId, type: 'CLINIC_EVENT' } });
    expect(eventos.length).toBeGreaterThanOrEqual(5);
    expect(eventos.every((e) => e.actorId === null)).toBe(true);
  });

  it('com o CRM desligado, nada acontece', async () => {
    await prisma.subscription.update({ where: { tenantId: tenant.id }, data: { crmEnabled: false } });
    const antes = await db.leadActivity.count({ where: { leadId } });
    await notifyCrm(tenant.id, { type: 'quote.created', patientId: paciente.id, quoteId: orcamento.id });
    expect(await db.leadActivity.count({ where: { leadId } })).toBe(antes);
  });
});
