import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

/** O canal da API oficial contra o banco de desenvolvimento, com a Meta simulada. */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('API oficial (banco)', async () => {
  const { prisma, getTenantClient, encrypt } = await import('@clinicaiq/db');
  const { ingestChat, applyChatStatus } = await import('./chat-ingest');
  const { activeCloudAccount, sealToken } = await import('./cloud');
  const { sendViaCloud, processCloudQueue } = await import('./cloud-send');
  const { writeChatMessage, loadThread, WINDOW_CLOSED_MESSAGE } = await import('./conversations');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `cloud_${suffix}`, name: 'Oficial', slug: `cloud-${suffix}` } });
  const db = getTenantClient(tenant.id);
  await prisma.whatsAppCloudAccount.create({
    data: { tenantId: tenant.id, wabaId: 'WABA', phoneNumberId: `PN_${suffix}`, accessTokenEncrypted: sealToken('TOKEN-CLINICA', tenant.id) },
  });
  const account = (await activeCloudAccount(tenant.id))!;

  let seq = 0;
  const meta = (resposta: object, status = 200) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(resposta), { status })));
  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.whatsAppCloudAccount.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  const chegou = (phone: string, text: string, at = new Date()) =>
    ingestChat(tenant.id, { externalId: `wamid.IN${suffix}${seq++}`, direction: 'INBOUND', origin: 'CONTACT', phone, contactName: 'Ana', kind: 'TEXT', text, at });

  it('mensagem do webhook vira conversa, abre a janela e não duplica', async () => {
    const r = await chegou('551187654321', 'Oi!');
    if (!r.recorded) throw new Error(r.reason);
    expect(r.isNew).toBe(true);
    const conv = await db.conversation.findFirst({ where: { id: r.conversationId } });
    expect(conv).toMatchObject({ unreadCount: 1, awaitingReply: true, contactName: 'Ana' });
    expect(conv?.lastInboundAt).not.toBeNull();

    const de_novo = await ingestChat(tenant.id, {
      externalId: (await db.chatMessage.findFirst({ where: { conversationId: r.conversationId } }))!.externalId,
      direction: 'INBOUND', origin: 'CONTACT', phone: '551187654321', kind: 'TEXT', text: 'Oi!', at: new Date(),
    });
    expect(de_novo).toEqual({ recorded: false, reason: 'duplicate' });
  });

  it('eco do celular (coexistência) entra como "Pelo celular" e zera as não lidas', async () => {
    const r = await ingestChat(tenant.id, {
      externalId: `wamid.ECHO${suffix}`, direction: 'OUTBOUND', origin: 'PHONE', phone: '5511987654321', kind: 'TEXT', text: 'Tenho às 15h', at: new Date(),
    });
    if (!r.recorded) throw new Error(r.reason);
    expect(await db.conversation.findFirst({ where: { id: r.conversationId } })).toMatchObject({ unreadCount: 0, awaitingReply: false });
  });

  it('resposta da equipe sai pela Meta com o token da clínica e fica com o id dela', async () => {
    const r = await chegou('5511911110001', 'Quanto custa?');
    if (!r.recorded) throw new Error(r.reason);
    const w = await writeChatMessage(db, { tenantId: tenant.id, userId: null }, r.conversationId, 'R$ 3.800', new Date(), { checkWindow: true });
    if (!w.ok) throw new Error(w.message);
    meta({ messages: [{ id: 'wamid.SAIU' }] });
    expect(await sendViaCloud(account, w.messageId)).toEqual({ ok: true });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/PN_${suffix}/messages`);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer TOKEN-CLINICA');
    const row = await db.chatMessage.findFirst({ where: { id: w.messageId } });
    expect(row).toMatchObject({ externalId: 'wamid.SAIU', status: 'PENDING' });
    expect(row?.acceptedAt).not.toBeNull();

    // Os status da Meta só andam para frente.
    await applyChatStatus(tenant.id, 'wamid.SAIU', 'READ', null);
    await applyChatStatus(tenant.id, 'wamid.SAIU', 'DELIVERED', null);
    expect((await db.chatMessage.findFirst({ where: { id: w.messageId } }))?.status).toBe('READ');
  });

  it('fora da janela de 24 h: texto livre é recusado; modelo passa', async () => {
    const velho = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const r = await chegou('5511911110002', 'Oi', velho);
    if (!r.recorded) throw new Error(r.reason);
    const livre = await writeChatMessage(db, { tenantId: tenant.id, userId: null }, r.conversationId, 'Oi de novo', new Date(), { checkWindow: true });
    expect(livre).toEqual({ ok: false, message: WINDOW_CLOSED_MESSAGE });

    const thread = await loadThread(db, tenant.id, r.conversationId);
    expect(thread).toMatchObject({ channel: 'cloud', windowOpen: false });

    const modelo = await writeChatMessage(db, { tenantId: tenant.id, userId: null }, r.conversationId, 'Oi Ana, podemos retomar?', new Date(), {
      checkWindow: true,
      template: { name: 'retomar_contato', lang: 'pt_BR', params: ['Ana'] },
    });
    if (!modelo.ok) throw new Error(modelo.message);
    meta({ messages: [{ id: 'wamid.MODELO' }] });
    expect(await sendViaCloud(account, modelo.messageId)).toEqual({ ok: true });
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ type: 'template', template: { name: 'retomar_contato', language: { code: 'pt_BR' } } });
  });

  it('limite da Meta volta para a fila; a fila manda quando der a hora', async () => {
    const r = await chegou('5511911110003', 'Oi');
    if (!r.recorded) throw new Error(r.reason);
    const antes = new Date(Date.now() - 60_000);
    const w = await writeChatMessage(db, { tenantId: tenant.id, userId: null }, r.conversationId, 'Já te respondo', antes);
    if (!w.ok) throw new Error(w.message);

    meta({ error: { code: 131056, message: 'pair rate limit' } }, 400);
    expect((await sendViaCloud(account, w.messageId)).ok).toBe(false);
    const row = await db.chatMessage.findFirst({ where: { id: w.messageId } });
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1 });

    await db.chatMessage.updateMany({ where: { id: w.messageId }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    meta({ messages: [{ id: 'wamid.DEPOIS' }] });
    expect(await processCloudQueue()).toBeGreaterThanOrEqual(1);
    expect((await db.chatMessage.findFirst({ where: { id: w.messageId } }))?.externalId).toBe('wamid.DEPOIS');
  });

  it('token expirado marca a conta com erro', async () => {
    const r = await chegou('5511911110004', 'Oi');
    if (!r.recorded) throw new Error(r.reason);
    const w = await writeChatMessage(db, { tenantId: tenant.id, userId: null }, r.conversationId, 'Oi');
    if (!w.ok) throw new Error(w.message);
    meta({ error: { code: 190, message: 'expired' } }, 401);
    await sendViaCloud(account, w.messageId);
    expect((await db.chatMessage.findFirst({ where: { id: w.messageId } }))?.status).toBe('FAILED');
    expect((await prisma.whatsAppCloudAccount.findUnique({ where: { tenantId: tenant.id } }))?.status).toBe('ERROR');
    expect(await activeCloudAccount(tenant.id)).toBeNull();
    void encrypt;
  });
});
