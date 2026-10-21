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
  const { saveCaptureRule } = await import('./capture');
  const { createPipeline } = await import('./settings');
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
    await prisma.captureRule.deleteMany({ where: t });
    await prisma.leadField.deleteMany({ where: t });
    await prisma.automationRun.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('cadastro: palavra-chave limpa e um só robô de contato novo ligado', async () => {
    expect(cleanKeywords([' Menu ', 'menu', '1', 'Olá!'])).toEqual(['menu', 'ola']);
    expect(await saveBot(db, tenant.id, { name: 'Boas-vindas', trigger: 'NEW_CONTACT', keywords: [], steps, active: true })).toMatchObject({ ok: true });
    expect((await saveBot(db, tenant.id, { name: 'Outro', trigger: 'NEW_CONTACT', keywords: [], steps, active: true })).ok).toBe(false);
    expect(await saveBot(db, tenant.id, { name: 'Menu', trigger: 'KEYWORD', keywords: ['menu'], steps, active: true })).toMatchObject({ ok: true });
  });

  it('número novo: o robô cumprimenta com o menu; submenu; opção final responde e põe a tag', async () => {
    const id = await escreve('11 96666-0001', 'Boa tarde!');
    expect(await saidas(id)).toEqual(['Oi! Como posso ajudar?']);
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

  it('pergunta: guarda o nome no lead e anota a resposta no histórico', async () => {
    const pergunta = {
      start: 'inicio',
      steps: {
        inicio: { id: 'inicio', text: 'Oi!', options: [{ id: 'nome', label: 'Quero falar', next: 'q_nome', actions: [{ type: 'createLead' }] }] },
        q_nome: { id: 'q_nome', kind: 'question', text: 'Qual é o seu nome?', options: [], saveTo: 'name', answer: { reply: 'Obrigado!' } },
      },
    };
    expect(await saveBot(db, tenant.id, { name: 'Nome', trigger: 'KEYWORD', keywords: ['nome'], steps: pergunta, active: true })).toMatchObject({ ok: true });
    const id = await escreve('11 96666-0009', 'nome');
    await escreve('11 96666-0009', '1');
    expect((await saidas(id)).at(-1)).toBe('Qual é o seu nome?');
    await escreve('11 96666-0009', 'Beatriz Lima');
    expect((await saidas(id)).at(-1)).toBe('Obrigado!');
    const conv = await db.conversation.findFirst({ where: { id }, include: { lead: { include: { activities: true } } } });
    expect(conv?.lead?.name).toBe('Beatriz Lima');
    expect(conv?.contactName).toBe('Beatriz Lima');
    expect(conv?.lead?.activities.some((a) => a.type === 'NOTE' && JSON.stringify(a.data).includes('Beatriz Lima'))).toBe(true);
    await db.chatbotFlow.deleteMany({ where: { name: 'Nome' } });
  });

  it('pergunta: guarda a resposta num campo personalizado, como o Salesbot', async () => {
    const campo = await db.leadField.create({ data: { tenantId: tenant.id, name: 'Convênio', type: 'SELECT', options: ['Amil', 'Unimed'] } });
    const pergunta = {
      start: 'inicio',
      steps: {
        inicio: { id: 'inicio', text: 'Oi!', options: [{ id: 'conv', label: 'Tenho convênio', next: 'q_conv', actions: [{ type: 'createLead' }] }] },
        q_conv: { id: 'q_conv', kind: 'question', text: 'Qual convênio?', options: [], saveTo: `field:${campo.id}`, answer: { reply: 'Anotado!' } },
      },
    };
    expect(await saveBot(db, tenant.id, { name: 'Convênio', trigger: 'KEYWORD', keywords: ['convenio'], steps: pergunta, active: true })).toMatchObject({ ok: true });
    const id = await escreve('11 96666-0012', 'convenio');
    await escreve('11 96666-0012', '1');
    await escreve('11 96666-0012', 'unimed');
    const conv = await db.conversation.findFirst({ where: { id }, include: { lead: true } });
    expect(conv?.lead?.fields).toEqual({ [campo.id]: 'Unimed' });
    await db.chatbotFlow.deleteMany({ where: { name: 'Convênio' } });
    await db.leadField.deleteMany({ where: { id: campo.id } });
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

  it('captação: palavra da primeira mensagem cria o lead com tag, funil e origem, e o robô ainda cumprimenta', async () => {
    const funil = await createPipeline(db, tenant.id, 'Implantes');
    if (!funil.ok) throw new Error(funil.message);
    const implante = await db.leadTag.create({ data: { tenantId: tenant.id, name: 'implante', color: 'green' } });
    expect(
      await saveCaptureRule(db, tenant.id, {
        name: 'Implante',
        keywords: ['Implante', 'dente fixo'],
        tagIds: [implante.id],
        pipelineId: funil.id,
        source: 'INSTAGRAM',
        active: true,
      }),
    ).toEqual({ ok: true });

    const id = await escreve('11 96666-0010', 'Oi! Vi no Instagram, quero saber dos implantes');
    const conv = await db.conversation.findFirst({ where: { id }, include: { lead: { include: { tags: true, stage: true, activities: true } } } });
    expect(conv?.lead).toMatchObject({ source: 'INSTAGRAM', name: 'Ana Souza' });
    expect(conv?.lead?.stage.pipelineId).toBe(funil.id);
    expect(conv?.lead?.tags.map((t) => t.tagId)).toEqual([implante.id]);
    expect(conv?.lead?.activities.some((a) => a.type === 'NOTE' && JSON.stringify(a.data).includes('implante'))).toBe(true);
    // O lead nasceu antes do robô, mas para o robô continua sendo um número novo.
    expect(await saidas(id)).toEqual(['Oi! Como posso ajudar?']);

    // Só a primeira mensagem conta.
    const id2 = await escreve('11 96666-0011', 'Boa tarde');
    await escreve('11 96666-0011', 'implante');
    expect((await db.conversation.findFirst({ where: { id: id2 }, include: { lead: { include: { tags: true } } } }))?.lead?.tags ?? []).toEqual([]);
  });

  it('robô por tag: quem chega com a tag da captação recebe o robô dela; os outros, o geral', async () => {
    const implante = (await db.leadTag.findFirst({ where: { name: 'implante' } }))!;
    const proprio = {
      start: 'inicio',
      steps: { inicio: { id: 'inicio', text: 'Oi! Sobre implantes:', options: [{ id: 'v', label: 'Valores' }] } },
      audience: { anyTags: [implante.id], noneTags: [] },
    };
    // Pede tag: pode ficar ligado junto com o de contato novo para todos.
    expect(await saveBot(db, tenant.id, { name: 'Implantes', trigger: 'NEW_CONTACT', keywords: [], steps: proprio, active: true })).toMatchObject({ ok: true });
    const comTag = await escreve('11 96666-0020', 'Quero colocar implante');
    expect(await saidas(comTag)).toEqual([expect.stringContaining('Sobre implantes')]);
    const semTag = await escreve('11 96666-0021', 'Oi');
    expect(await saidas(semTag)).toEqual([expect.stringContaining('Como posso ajudar?')]);

    // "Nunca com": o geral deixa de responder a quem tem a tag bloqueada.
    const geral = (await db.chatbotFlow.findFirst({ where: { name: 'Boas-vindas' } }))!;
    await toggleBot(db, (await db.chatbotFlow.findFirst({ where: { name: 'Implantes' } }))!.id, false);
    expect(
      await saveBot(db, tenant.id, { id: geral.id, name: 'Boas-vindas', trigger: 'NEW_CONTACT', keywords: [], steps: { ...steps, audience: { anyTags: [], noneTags: [implante.id] } }, active: true }),
    ).toMatchObject({ ok: true });
    const bloqueado = await escreve('11 96666-0022', 'implante, por favor');
    expect(await saidas(bloqueado)).toEqual([]);
  });

  it('resposta personalizada e o nome da pessoa nas conversas de verdade', async () => {
    const regras = {
      start: 'inicio',
      steps: {
        inicio: {
          id: 'inicio',
          text: 'Oi, {primeiro_nome}! Em que posso ajudar?',
          options: [{ id: 'a', label: 'Agendar' }],
          rules: [{ id: 'r1', keywords: ['valor', 'preço'], reply: 'Depende da avaliação, {primeiro_nome}.', then: 'stay', actions: [{ type: 'tag', tagId: tag.id }] }],
        },
      },
    };
    expect(await saveBot(db, tenant.id, { name: 'Regras', trigger: 'KEYWORD', keywords: ['ajuda'], steps: regras, active: true })).toMatchObject({ ok: true });
    const id = await escreve('11 96666-0030', 'ajuda');
    expect(await saidas(id)).toEqual(['Oi, Ana! Em que posso ajudar?']);
    await escreve('11 96666-0030', 'qual o preço?');
    expect((await saidas(id)).at(-1)).toBe('Depende da avaliação, Ana.');
    const conv = await db.conversation.findFirst({ where: { id }, include: { lead: { include: { tags: true } } } });
    expect(conv?.botStepId).toBe('inicio');
    expect(conv?.lead?.tags.map((t) => t.tagId)).toEqual([tag.id]);
    await db.chatbotFlow.deleteMany({ where: { name: 'Regras' } });
  });

  it('formato novo: sem resposta acorda pelo relógio, rodízio alterna e a ação cria tarefa', async () => {
    const { wakeBots } = await import('./bot');
    const fluxo = {
      version: 2,
      start: 'oi',
      steps: {
        oi: { id: 'oi', type: 'message', text: 'Oi, {{primeiro_nome}}! Posso ajudar?', buttons: [{ id: 's', label: 'Sim', synonyms: ['quero'] }], waitReply: true, timeoutMinutes: 30, out: { 'b:s': 'rr', timeout: 'lembra' } },
        lembra: { id: 'lembra', type: 'message', text: 'Ainda está por aí?', buttons: [], waitReply: false, timeoutMinutes: null, out: { next: 'tarefa' } },
        tarefa: { id: 'tarefa', type: 'action', actions: [{ type: 'task', text: 'Ligar para quem sumiu', dueMinutes: 60 }], out: {} },
        rr: { id: 'rr', type: 'roundRobin', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], out: { 'r:a': 'msgA', 'r:b': 'msgB' } },
        msgA: { id: 'msgA', type: 'message', text: 'Opção A', buttons: [], waitReply: false, timeoutMinutes: null, out: {} },
        msgB: { id: 'msgB', type: 'message', text: 'Opção B', buttons: [], waitReply: false, timeoutMinutes: null, out: {} },
      },
    };
    expect(await saveBot(db, tenant.id, { name: 'Novo', trigger: 'KEYWORD', keywords: ['novo'], steps: fluxo, active: true })).toMatchObject({ ok: true });

    const a = await escreve('11 96666-0040', 'novo');
    expect(await saidas(a)).toEqual(['Oi, Ana! Posso ajudar?']);
    const esperando = await db.conversation.findFirst({ where: { id: a } });
    expect(esperando?.botWakeAt).toBeInstanceOf(Date);

    // Passou meia hora sem resposta: o relógio acorda, manda o lembrete e cria a tarefa.
    expect(await wakeBots(new Date(Date.now() + 31 * 60_000))).toBeGreaterThanOrEqual(1);
    expect((await saidas(a)).at(-1)).toBe('Ainda está por aí?');
    const conv = await db.conversation.findFirst({ where: { id: a }, include: { lead: { include: { tasks: true } } } });
    expect(conv?.botFlowId).toBeNull();
    expect(conv?.lead?.tasks.map((t) => t.text)).toEqual(['Ligar para quem sumiu']);

    // Rodízio: dois que dizem "quero" vão para opções diferentes.
    const b = await escreve('11 96666-0041', 'novo');
    await escreve('11 96666-0041', 'quero');
    const c = await escreve('11 96666-0042', 'novo');
    await escreve('11 96666-0042', 'quero');
    expect([(await saidas(b)).at(-1), (await saidas(c)).at(-1)].sort()).toEqual(['Opção A', 'Opção B']);
    await db.chatbotFlow.deleteMany({ where: { name: 'Novo' } });
  });

  it('gatilhos do Kommo: lead entra na etapa, tag posta e sem resposta', async () => {
    const { wakeBots, startNoReplyBots } = await import('./bot');
    const { createLead, moveLead, setTags } = await import('./leads');
    const actor = { tenantId: tenant.id, userId: user.id };
    const avisa = (texto: string) => ({
      version: 2,
      start: 'm',
      steps: { m: { id: 'm', type: 'message', text: texto, buttons: [], waitReply: false, timeoutMinutes: null, out: {} } },
    });
    const vip = await db.leadTag.create({ data: { tenantId: tenant.id, name: 'vip-gatilho', color: 'blue' } });
    expect(
      await saveBot(db, tenant.id, { name: 'Etapa', trigger: 'STAGE', keywords: [], steps: { ...avisa('Que bom que vamos conversar, {{primeiro_nome}}!'), trigger: { stageIds: [conversa.id] } }, active: true }),
    ).toEqual(expect.objectContaining({ ok: true }));
    expect(await saveBot(db, tenant.id, { name: 'Tag', trigger: 'TAG', keywords: [], steps: { ...avisa('Você agora é VIP!'), trigger: { tagIds: [vip.id] } }, active: true })).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(await saveBot(db, tenant.id, { name: 'Sumiu', trigger: 'NO_REPLY', keywords: [], steps: { ...avisa('Ainda tem interesse?'), trigger: { hours: 24 } }, active: true })).toEqual(
      expect.objectContaining({ ok: true }),
    );
    // Sem dizer quando, não salva.
    expect((await saveBot(db, tenant.id, { name: 'Ruim', trigger: 'STAGE', keywords: [], steps: avisa('x'), active: false })).ok).toBe(false);

    // Etapa: a pessoa já conversou; o lead vai para "Em conversa" e o relógio começa o robô.
    const c1 = await escreve('11 96666-0050', 'Oi');
    for (const f of await db.chatbotFlow.findMany({ where: { trigger: { in: ['NEW_CONTACT', 'KEYWORD'] } } })) await toggleBot(db, f.id, false);
    const l1 = await createLead(db, actor, { name: 'Ana Souza', phone: '11 96666-0050', automations: false });
    if (!l1.ok) throw new Error(l1.message);
    await db.conversation.updateMany({ where: { id: c1 }, data: { botFlowId: null, botStepId: null, botWakeAt: null } });
    await moveLead(db, actor, l1.leadId, { stageId: conversa.id });
    expect((await db.conversation.findFirst({ where: { id: c1 } }))?.botStepId).toBe('__start__');
    await wakeBots(new Date(Date.now() + 1000));
    expect((await saidas(c1)).at(-1)).toBe('Que bom que vamos conversar, Ana!');

    // Tag posta por alguém da equipe.
    await setTags(db, actor, l1.leadId, [vip.id]);
    await wakeBots(new Date(Date.now() + 1000));
    expect((await saidas(c1)).at(-1)).toBe('Você agora é VIP!');

    // Sem resposta: a equipe falou por último há 25 horas.
    const c2 = await escreve('11 96666-0051', 'Quanto custa?');
    await db.conversation.updateMany({ where: { id: c2 }, data: { status: 'ACTIVE', botFlowId: null, botStepId: null, botWakeAt: null } });
    // A pergunta da pessoa veio antes (26 h), a resposta da equipe depois (25 h).
    await db.chatMessage.updateMany({ where: { conversationId: c2, direction: 'INBOUND' }, data: { at: new Date(Date.now() - 26 * 3_600_000) } });
    await writeChatMessage(db, actor, c2, 'Custa R$ 900. Quer agendar?', new Date(Date.now() - 25 * 3_600_000));
    expect(await startNoReplyBots(new Date())).toBeGreaterThanOrEqual(1);
    expect((await saidas(c2)).at(-1)).toBe('Ainda tem interesse?');
    // A última agora é do robô: não começa de novo.
    await db.conversation.updateMany({ where: { id: c2 }, data: { lastMessageAt: new Date(Date.now() - 25 * 3_600_000) } });
    expect(await startNoReplyBots(new Date())).toBe(0);

    await db.chatbotFlow.deleteMany({ where: { name: { in: ['Etapa', 'Tag', 'Sumiu'] } } });
  });

  it('robô desligado não responde', async () => {
    for (const f of await db.chatbotFlow.findMany()) await toggleBot(db, f.id, false);
    const id = await escreve('11 96666-0004', 'Oi');
    expect(await saidas(id)).toEqual([]);
  });
});
