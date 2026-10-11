import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';
// Sem gateway: as mensagens do robô são dadas como enviadas.
delete process.env.WHATSAPP_GATEWAY_URL;

describe.skipIf(!process.env.DATABASE_URL)('robô (banco)', async () => {
  const { prisma, getTenantClient, encrypt, decrypt } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { conversationHash } = await import('./phone');
  const { afterInbound } = await import('./inbound');
  const { writeChatMessage } = await import('./conversations');
  const { saveBot, toggleBot, cleanKeywords } = await import('./bot-admin');
  const { chatKey } = await import('@/lib/phone');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `bot_${suffix}`, name: 'Robô', slug: `bot-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Rita', email: `r-${suffix}@teste.local`, role: 'RECEPTIONIST' } });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  const conversa = (await db.pipelineStage.findFirst({ where: { name: 'Em conversa' } }))!;
  const tag = await db.leadTag.create({ data: { tenantId: tenant.id, name: 'clareamento', color: 'blue' } });

  const steps = {
    start: 'inicio',
    steps: {
      inicio: {
        id: 'inicio',
        text: 'Oi! Como posso ajudar?',
        options: [
          { id: 'agendar', label: 'Agendar avaliação', reply: 'Já vou te passar para a recepção.', actions: [{ type: 'createLead', stageId: conversa.id }, { type: 'handoff' }] },
          { id: 'valores', label: 'Valores', next: 'valores' },
        ],
      },
      valores: {
        id: 'valores',
        text: 'Qual tratamento?',
        options: [{ id: 'clareamento', label: 'Clareamento', reply: 'Começa em R$ 900.', actions: [{ type: 'tag', tagId: tag.id }] }],
      },
    },
  };

  let seq = 0;
  async function escreve(phone: string, text: string) {
    const k = chatKey(phone);
    const hash = conversationHash(k, tenant.id);
    const conv =
      (await db.conversation.findFirst({ where: { phoneHash: hash } })) ??
      (await db.conversation.create({ data: { tenantId: tenant.id, phoneHash: hash, phoneEncrypted: encrypt(k, key, tenant.id), contactName: 'Ana Souza' } }));
    const m = await db.chatMessage.create({
      data: { tenantId: tenant.id, conversationId: conv.id, direction: 'INBOUND', origin: 'CONTACT', textEncrypted: encrypt(text, key, tenant.id), externalId: `B${suffix}${seq++}` },
    });
    await afterInbound(tenant.id, conv.id, m.id);
    return conv.id;
  }
  const saidas = async (conversationId: string) =>
    (await db.chatMessage.findMany({ where: { conversationId, origin: 'BOT' }, orderBy: [{ at: 'asc' }, { createdAt: 'asc' }] })).map((m) =>
      decrypt(m.textEncrypted!, key, tenant.id),
    );

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.chatbotFlow.deleteMany({ where: t });
    await prisma.automationRun.deleteMany({ where: t });
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

  it('cadastro: palavra-chave limpa e um só robô de contato novo ligado', async () => {
    expect(cleanKeywords([' Menu ', 'menu', '1', 'Olá!'])).toEqual(['menu', 'ola']);
    expect(await saveBot(db, tenant.id, { name: 'Boas-vindas', trigger: 'NEW_CONTACT', keywords: [], steps, active: true })).toEqual({ ok: true });
    expect((await saveBot(db, tenant.id, { name: 'Outro', trigger: 'NEW_CONTACT', keywords: [], steps, active: true })).ok).toBe(false);
    expect(await saveBot(db, tenant.id, { name: 'Menu', trigger: 'KEYWORD', keywords: ['menu'], steps, active: true })).toEqual({ ok: true });
  });

  it('número novo: o robô cumprimenta com o menu; submenu; opção final responde e põe a tag', async () => {
    const id = await escreve('11 96666-0001', 'Boa tarde!');
    expect(await saidas(id)).toEqual(['Oi! Como posso ajudar?\n\n1 - Agendar avaliação\n2 - Valores']);
    const primeira = await db.chatMessage.findFirst({ where: { conversationId: id, origin: 'BOT' } });
    expect(primeira?.buttons).toEqual([
      { id: 'bot:inicio:agendar', title: 'Agendar avaliação' },
      { id: 'bot:inicio:valores', title: 'Valores' },
    ]);
    expect(await db.conversation.findFirst({ where: { id } })).toMatchObject({ botStepId: 'inicio' });

    await escreve('11 96666-0001', '2');
    expect((await saidas(id)).at(-1)).toContain('Qual tratamento?');

    await escreve('11 96666-0001', 'clareamento');
    expect((await saidas(id)).at(-1)).toBe('Começa em R$ 900.');
    const conv = await db.conversation.findFirst({ where: { id }, include: { lead: { include: { tags: true } } } });
    expect(conv?.botFlowId).toBeNull();
    // Pôr a tag precisa de um lead: o robô criou, e a conversa saiu da Entrada.
    expect(conv?.lead?.tags.map((t) => t.tagId)).toEqual([tag.id]);
    expect(conv?.status).toBe('ACTIVE');
  });

  it('"agendar": cria o lead na etapa escolhida e passa para a equipe', async () => {
    const id = await escreve('11 96666-0002', 'Oi');
    await escreve('11 96666-0002', '1');
    const conv = await db.conversation.findFirst({ where: { id }, include: { lead: true } });
    expect(conv?.lead).toMatchObject({ stageId: conversa.id, source: 'WHATSAPP', name: 'Ana Souza' });
    expect(conv?.botFlowId).toBeNull();
    expect((await saidas(id)).at(-1)).toBe('Já vou te passar para a recepção.');
  });

  it('não entendeu duas vezes: chama a equipe', async () => {
    const id = await escreve('11 96666-0003', 'Oi');
    await escreve('11 96666-0003', 'quanto custa?');
    await escreve('11 96666-0003', 'hein');
    expect((await saidas(id)).at(-1)).toMatch(/chamar alguém da equipe/);
    expect((await db.conversation.findFirst({ where: { id } }))?.botFlowId).toBeNull();
  });

  it('palavra-chave reabre o menu; resposta da equipe tira o robô', async () => {
    const id = await escreve('11 96666-0003', 'Menu');
    expect((await db.conversation.findFirst({ where: { id } }))?.botStepId).toBe('inicio');
    await writeChatMessage(db, { tenantId: tenant.id, userId: user.id }, id, 'Oi! Aqui é a Rita.');
    expect((await db.conversation.findFirst({ where: { id } }))?.botFlowId).toBeNull();
    // Mensagem comum de quem já conversa: o robô não volta sozinho.
    const antes = (await saidas(id)).length;
    await escreve('11 96666-0003', 'obrigada');
    expect((await saidas(id)).length).toBe(antes);
  });

  it('robô desligado não responde', async () => {
    for (const f of await db.chatbotFlow.findMany()) await toggleBot(db, f.id, false);
    const id = await escreve('11 96666-0004', 'Oi');
    expect(await saidas(id)).toEqual([]);
  });
});
