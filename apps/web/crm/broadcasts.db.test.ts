import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe('transmissões: regras puras', async () => {
  const { sendTimes, parseAudience, personalize, gatewayDurationMinutes } = await import('./broadcasts');

  it('no QR, 12 a 28 s entre mensagens e pausa de 2 min a cada 20', () => {
    const t0 = new Date('2026-10-11T12:00:00Z');
    const meio = () => 0.5; // 12 + 8 = 20 s
    const t = sendTimes(22, t0, 'gateway', meio);
    expect(t[0]).toEqual(t0);
    expect(t[1].getTime() - t[0].getTime()).toBe(20_000);
    expect(t[20].getTime() - t[19].getTime()).toBe(20_000 + 120_000);
    expect(sendTimes(3, t0, 'cloud').map((d) => d.getTime() - t0.getTime())).toEqual([0, 500, 1000]);
    expect(gatewayDurationMinutes(40)).toBe(18);
  });

  it('público: só o que é válido passa', () => {
    expect(parseAudience({ stageIds: ['a', 3], sources: ['WHATSAPP', 'HACK'], tagIds: 'x' })).toEqual({
      stageIds: ['a'],
      tagIds: [],
      sources: ['WHATSAPP'],
      assignedToIds: [],
    });
  });

  it('{nome} vira o primeiro nome', () => {
    expect(personalize('Oi {nome}! {NOME}', 'Ana Paula Souza')).toBe('Oi Ana! Ana');
  });
});

describe.skipIf(!process.env.DATABASE_URL)('transmissões (banco)', async () => {
  const { prisma, getTenantClient, encrypt } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead } = await import('./leads');
  const b = await import('./broadcasts');
  const { decrypt } = await import('@clinicaiq/db');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `bc_${suffix}`, name: 'Transmissão', slug: `bc-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `d-${suffix}@teste.local`, role: 'OWNER' } });
  const db = getTenantClient(tenant.id);
  const actor = { tenantId: tenant.id, userId: user.id };
  await ensureDefaultPipeline(db, tenant.id);
  const novo = (await db.pipelineStage.findFirst({ where: { role: 'NEW' } }))!;

  const mk = async (name: string, phone: string) => {
    const r = await createLead(db, actor, { name, phone });
    if (!r.ok) throw new Error(r.message);
    return r.leadId;
  };
  const ana = await mk('Ana Souza', '11 98888-0001');
  const bia = await mk('Bia Lima', '11 98888-0002');
  const saiu = await mk('Carla Dias', '11 98888-0003');
  await db.lead.updateMany({ where: { id: saiu }, data: { whatsappOptOut: true } });
  // Telefone que não serve (gravado direto, o formulário não deixaria).
  const ruim = await db.lead.create({
    data: { tenantId: tenant.id, name: 'Sem fone', phoneEncrypted: encrypt('123', key, tenant.id), phoneHash: `x_${suffix}`, stageId: novo.id },
  });

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.broadcastRecipient.deleteMany({ where: t });
    await prisma.broadcast.deleteMany({ where: t });
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('público mostra quantos recebem e quantos pediram para sair', async () => {
    expect(await b.previewAudience(db, { ...b.EMPTY_AUDIENCE, stageIds: [novo.id] })).toEqual({ total: 4, optedOut: 1, reachable: 3 });
  });

  it('no QR: cada pessoa vira uma mensagem personalizada na fila, espaçada; quem saiu é pulado', async () => {
    const r = await b.createBroadcast(db, actor, { name: 'Outubro', audience: { ...b.EMPTY_AUDIENCE, stageIds: [novo.id] }, text: 'Oi {nome}! Clareamento com 20% em outubro.' });
    if (!r.ok) throw new Error(r.message);
    expect(r.startNow).toBe(true);
    const s = await b.startBroadcast(tenant.id, r.broadcastId);
    expect(s).toEqual({ ok: true, queued: 2, skipped: 2 });

    const recips = await db.broadcastRecipient.findMany({
      where: { broadcastId: r.broadcastId },
      include: { chatMessage: true, lead: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const pulados = Object.fromEntries(recips.filter((x) => x.status === 'SKIPPED').map((x) => [x.lead.name, x.skipReason]));
    expect(pulados).toEqual({ 'Carla Dias': 'Pediu para não receber', 'Sem fone': 'Telefone inválido' });

    const msgs = recips.filter((x) => x.chatMessage).map((x) => x.chatMessage!);
    expect(msgs.map((m) => m.origin)).toEqual(['BROADCAST', 'BROADCAST']);
    expect(msgs.map((m) => decrypt(m.textEncrypted!, key, tenant.id)).sort()).toEqual([
      'Oi Ana! Clareamento com 20% em outubro.',
      'Oi Bia! Clareamento com 20% em outubro.',
    ]);
    const gap = Math.abs(msgs[1].at.getTime() - msgs[0].at.getTime());
    expect(gap).toBeGreaterThanOrEqual(12_000);

    // Rodar de novo não manda duas vezes.
    expect((await b.startBroadcast(tenant.id, r.broadcastId)).ok).toBe(false);
    void ana;
    void bia;
    void ruim;
  });

  it('números: enviada, entregue, lida, respondida; termina quando a fila esvazia', async () => {
    const bc = (await db.broadcast.findFirst({ orderBy: { createdAt: 'desc' } }))!;
    const recips = await db.broadcastRecipient.findMany({ where: { broadcastId: bc.id, status: 'QUEUED' } });
    await db.chatMessage.updateMany({ where: { id: recips[0].chatMessageId! }, data: { status: 'READ', acceptedAt: new Date() } });
    await db.chatMessage.updateMany({ where: { id: recips[1].chatMessageId! }, data: { status: 'FAILED' } });
    await db.chatMessage.create({
      data: {
        tenantId: tenant.id,
        conversationId: recips[0].conversationId!,
        direction: 'INBOUND',
        origin: 'CONTACT',
        externalId: `R${suffix}`,
        at: new Date(Date.now() + 120_000),
      },
    });
    expect(await b.broadcastStats(db, bc.id)).toEqual({ total: 4, skipped: 2, waiting: 0, sent: 1, delivered: 1, read: 1, failed: 1, replied: 1 });

    await db.broadcast.updateMany({ where: { id: bc.id }, data: { startedAt: new Date(Date.now() - 60_000) } });
    expect(await b.finishBroadcasts()).toBeGreaterThanOrEqual(1);
    expect((await db.broadcast.findFirst({ where: { id: bc.id } }))?.status).toBe('DONE');
  });

  it('agendada começa no relógio; cancelar tira da fila o que não saiu', async () => {
    const quando = new Date(Date.now() + 2 * 60 * 60_000);
    const r = await b.createBroadcast(db, actor, { name: 'Agendada', audience: { ...b.EMPTY_AUDIENCE, stageIds: [novo.id] }, text: 'Oi {nome}', scheduledAt: quando });
    if (!r.ok) throw new Error(r.message);
    expect(r.startNow).toBe(false);
    expect(await b.startDueBroadcasts(new Date())).toBe(0);
    expect(await b.startDueBroadcasts(new Date(quando.getTime() + 1000))).toBe(1);

    const c = await b.cancelBroadcast(db, r.broadcastId);
    expect(c).toMatchObject({ ok: true });
    expect((await db.broadcast.findFirst({ where: { id: r.broadcastId } }))?.status).toBe('CANCELLED');
    expect(await db.broadcastRecipient.count({ where: { broadcastId: r.broadcastId, chatMessageId: { not: null } } })).toBe(0);
  });

  it('na API oficial, transmissão sem modelo aprovado é recusada', async () => {
    await prisma.whatsAppCloudAccount.create({
      data: { tenantId: tenant.id, wabaId: 'W', phoneNumberId: `PNB_${suffix}`, accessTokenEncrypted: encrypt('t', key, tenant.id) },
    });
    const r = await b.createBroadcast(db, actor, { name: 'X', audience: b.EMPTY_AUDIENCE, text: 'Oi' });
    expect(r).toEqual({ ok: false, message: 'Na API oficial, a transmissão precisa de um modelo aprovado.' });
    await prisma.whatsAppCloudAccount.deleteMany({ where: { tenantId: tenant.id } });
  });
});
