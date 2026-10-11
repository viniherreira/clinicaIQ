import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * A gravação das conversas contra o banco de desenvolvimento. Lê as mesmas
 * variáveis do app (banco local e chave de desenvolvimento); sem elas, pula.
 */
for (const f of ['../../../packages/db/.env', '../../web/.env.local']) {
  const path = resolve(__dirname, f);
  if (existsSync(path)) process.loadEnvFile(path);
}
const ready = Boolean(process.env.DATABASE_URL && process.env.ENCRYPTION_MASTER_KEY);

describe.skipIf(!ready)('conversas do CRM (banco)', async () => {
  const { prisma, decrypt } = await import('./db.js');
  const { recordChatMessage, applyChatAck, markOwnSend, resetChatCaches } = await import('./chat-log.js');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `chat_${suffix}`, name: 'Conversas', slug: `chat-${suffix}` } });
  const sub = await prisma.subscription.create({
    data: { tenantId: tenant.id, tier: 'PROFISSIONAL', status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01'), crmEnabled: true },
  });

  let seq = 0;
  const msg = (over: Partial<Parameters<typeof recordChatMessage>[1]> = {}) => ({
    externalId: `3EB0TEST${suffix}${seq++}`,
    fromMe: false,
    phone: '551187654321', // celular antigo, sem o 9
    pushName: 'Ana Souza',
    message: { conversation: 'Oi, quero marcar uma avaliação' },
    timestamp: Math.floor(Date.now() / 1000) + seq,
    ...over,
  });

  beforeEach(() => resetChatCaches());

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.conversation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('primeira mensagem cria a conversa na Entrada, cifrada, e pede classificação', async () => {
    const r = await recordChatMessage(tenant.id, msg());
    expect(r).toMatchObject({ recorded: true, needsClassification: true });
    const conv = await prisma.conversation.findFirstOrThrow({ where: { tenantId: tenant.id }, include: { messages: true } });
    expect(conv).toMatchObject({ status: 'INBOX', unreadCount: 1, awaitingReply: true, contactName: 'Ana Souza' });
    // A janela de 24 horas da API oficial começa na última mensagem do contato.
    expect(conv.lastInboundAt).not.toBeNull();
    // A chave tem o 9; o texto e o telefone não ficam legíveis no banco.
    expect(decrypt(conv.phoneEncrypted, key, tenant.id)).toBe('5511987654321');
    expect(conv.messages[0].textEncrypted).not.toContain('avaliação');
    expect(decrypt(conv.messages[0].textEncrypted!, key, tenant.id)).toBe('Oi, quero marcar uma avaliação');
    expect(conv.messages[0]).toMatchObject({ direction: 'INBOUND', origin: 'CONTACT', kind: 'TEXT' });
  });

  it('o mesmo número com o 9 cai na mesma conversa; a mesma mensagem não grava duas vezes', async () => {
    const m = msg({ phone: '5511987654321', message: { audioMessage: {} } });
    expect((await recordChatMessage(tenant.id, m)).recorded).toBe(true);
    expect(await recordChatMessage(tenant.id, m)).toEqual({ recorded: false, reason: 'duplicate' });
    const conv = await prisma.conversation.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect(conv.unreadCount).toBe(2);
    expect(await prisma.conversation.count({ where: { tenantId: tenant.id } })).toBe(1);
  });

  it('resposta pelo celular zera as não lidas; lembrete do sistema não mexe', async () => {
    const lembrete = msg({ fromMe: true, message: { conversation: 'Lembrete: amanhã às 10h' } });
    markOwnSend(lembrete.externalId, 'AUTOMATION');
    await recordChatMessage(tenant.id, lembrete);
    let conv = await prisma.conversation.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect(conv).toMatchObject({ unreadCount: 2, awaitingReply: true });

    await recordChatMessage(tenant.id, msg({ fromMe: true, message: { conversation: 'Oi Ana! Tenho terça às 15h' } }));
    conv = await prisma.conversation.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect(conv).toMatchObject({ unreadCount: 0, awaitingReply: false });

    const origens = await prisma.chatMessage.findMany({ where: { tenantId: tenant.id, direction: 'OUTBOUND' }, orderBy: { at: 'asc' } });
    expect(origens.map((o) => o.origin)).toEqual(['AUTOMATION', 'PHONE']);
  });

  it('acks só andam para frente', async () => {
    const out = msg({ fromMe: true });
    await recordChatMessage(tenant.id, out);
    await applyChatAck(tenant.id, out.externalId, 4); // lida
    await applyChatAck(tenant.id, out.externalId, 3); // entregue, atrasado
    const row = await prisma.chatMessage.findFirstOrThrow({ where: { externalId: out.externalId } });
    expect(row.status).toBe('READ');
  });

  it('recusada volta para a Entrada quando a pessoa escreve de novo', async () => {
    await prisma.conversation.updateMany({ where: { tenantId: tenant.id }, data: { status: 'DECLINED' } });
    await recordChatMessage(tenant.id, msg());
    expect((await prisma.conversation.findFirstOrThrow({ where: { tenantId: tenant.id } })).status).toBe('INBOX');
  });

  it('nada é gravado sem o CRM, para grupo sem telefone ou para reação', async () => {
    expect(await recordChatMessage(tenant.id, msg({ message: { reactionMessage: { text: '👍' } } }))).toEqual({ recorded: false, reason: 'not-chat' });
    expect(await recordChatMessage(tenant.id, msg({ phone: '' }))).toEqual({ recorded: false, reason: 'no-phone' });
    // Com a API oficial ativa, quem grava é o webhook da Meta: aqui duplicaria.
    await prisma.whatsAppCloudAccount.create({
      data: { tenantId: tenant.id, wabaId: 'W', phoneNumberId: `PN_${suffix}`, accessTokenEncrypted: 'x' },
    });
    resetChatCaches();
    expect(await recordChatMessage(tenant.id, msg())).toEqual({ recorded: false, reason: 'crm-off' });
    await prisma.whatsAppCloudAccount.deleteMany({ where: { tenantId: tenant.id } });

    await prisma.subscription.update({ where: { id: sub.id }, data: { crmEnabled: false } });
    resetChatCaches();
    expect(await recordChatMessage(tenant.id, msg())).toEqual({ recorded: false, reason: 'crm-off' });
  });
});
