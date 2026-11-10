import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

/**
 * Sem a API oficial ligada, em produção, não há por onde a mensagem do CRM sair
 * (o QR code saiu do sistema). Ela não pode ficar "saindo" para sempre: vira
 * "não enviada", com o motivo, e transmissão nova nem começa.
 */
describe.skipIf(!process.env.DATABASE_URL)('sem a API oficial (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead } = await import('./leads');
  const { ensureConversationForLead, writeChatMessage, NO_CHANNEL_MESSAGE } = await import('./conversations');
  const { dispatchChat } = await import('./chat-dispatch');
  const { settleWithoutChannel } = await import('./no-channel');
  const b = await import('./broadcasts');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `nc_${suffix}`, name: 'Sem canal', slug: `nc-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `nc-${suffix}@teste.local`, role: 'OWNER' } });
  const db = getTenantClient(tenant.id);
  const actor = { tenantId: tenant.id, userId: user.id };
  await ensureDefaultPipeline(db, tenant.id);
  const lead = await createLead(db, actor, { name: 'Ana Souza', phone: '11 97777-0001' });
  if (!lead.ok) throw new Error(lead.message);
  const conv = await ensureConversationForLead(db, tenant.id, lead.leadId);
  if (!conv.ok) throw new Error(conv.message);

  afterEach(() => vi.unstubAllEnvs());
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
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  const escrever = async (texto: string, at = new Date()) => {
    const r = await writeChatMessage(db, actor, conv.conversationId, texto, at);
    if (!r.ok) throw new Error(r.message);
    return r.messageId;
  };
  const situacao = (id: string) => db.chatMessage.findFirst({ where: { id }, select: { status: true, errorMessage: true } });

  it('resposta na hora: em produção vira "não enviada", com o motivo', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const id = await escrever('Oi, tudo bem?');
    await dispatchChat(tenant.id, id);
    expect(await situacao(id)).toEqual({ status: 'FAILED', errorMessage: NO_CHANNEL_MESSAGE });
  });

  it('no desenvolvimento, a mesma resposta é dada como enviada', async () => {
    const id = await escrever('Oi de novo');
    await dispatchChat(tenant.id, id);
    expect((await situacao(id))?.status).toBe('SENT');
  });

  it('mensagem com hora marcada: o relógio dá como não enviada um minuto depois da hora', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const agora = new Date();
    const id = await escrever('Lembrete do robô', new Date(agora.getTime() - 30_000));
    await settleWithoutChannel(agora);
    expect((await situacao(id))?.status).toBe('PENDING');
    await settleWithoutChannel(new Date(agora.getTime() + 60_000));
    expect(await situacao(id)).toEqual({ status: 'FAILED', errorMessage: NO_CHANNEL_MESSAGE });
  });

  it('transmissão de texto em produção não é criada: pede para conectar', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = await b.createBroadcast(db, actor, { name: 'Outubro', audience: b.EMPTY_AUDIENCE, text: 'Oi {nome}!' });
    expect(r).toEqual({ ok: false, message: 'Conecte o WhatsApp oficial da clínica para mandar transmissões.' });
  });
});
