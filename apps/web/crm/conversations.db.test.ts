import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/** As conversas do CRM contra o banco de desenvolvimento, numa clínica descartável. */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('conversas (banco)', async () => {
  const { prisma, getTenantClient, encrypt } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead, linkPatient } = await import('./leads');
  const { conversationHash } = await import('./phone');
  const c = await import('./conversations');
  const { chatKey } = await import('@/lib/phone');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `conv_${suffix}`, name: 'Conversas', slug: `conv-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Recepção', email: `r-${suffix}@teste.local`, role: 'RECEPTIONIST' } });
  const outra = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `d-${suffix}@teste.local`, role: 'OWNER' } });
  const db = getTenantClient(tenant.id);
  const actor = { tenantId: tenant.id, userId: user.id };
  await ensureDefaultPipeline(db, tenant.id);

  let seq = 0;
  /** O que o gateway gravaria: conversa sem classificar e uma mensagem do contato. */
  async function chegou(phone: string, name: string, text = 'Oi!') {
    const k = chatKey(phone);
    const conv = await prisma.conversation.create({
      data: {
        tenantId: tenant.id,
        phoneHash: conversationHash(k, tenant.id),
        phoneEncrypted: encrypt(k, key, tenant.id),
        contactName: name,
        unreadCount: 1,
        awaitingReply: true,
        lastPreviewEncrypted: encrypt(text, key, tenant.id),
        lastMessageAt: new Date(Date.now() + seq * 1000),
      },
    });
    await prisma.chatMessage.create({
      data: {
        tenantId: tenant.id,
        conversationId: conv.id,
        direction: 'INBOUND',
        origin: 'CONTACT',
        textEncrypted: encrypt(text, key, tenant.id),
        externalId: `IN${suffix}${seq++}`,
        at: new Date(Date.now() - 60_000),
      },
    });
    return conv.id;
  }
  const get = (id: string) => prisma.conversation.findUnique({ where: { id } });

  beforeEach(() => c.forgetPatientKeys());

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.patient.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('número de lead aberto liga ao lead, mesmo chegando sem o 9', async () => {
    const lead = await createLead(db, actor, { name: 'Bruna', phone: '(11) 98765-1001' });
    if (!lead.ok) throw new Error(lead.message);
    const id = await chegou('551187651001', 'Bruna WhatsApp');
    expect(await c.classifyConversation(db, tenant.id, id)).toBe('lead');
    expect(await get(id)).toMatchObject({ leadId: lead.leadId, status: 'ACTIVE' });
    // Uma vez só.
    expect(await c.classifyConversation(db, tenant.id, id)).toBe('skip');
  });

  it('número de paciente liga ao paciente; desconhecido fica na Entrada', async () => {
    const p = await prisma.patient.create({
      data: { tenantId: tenant.id, controlNumber: 1, name: 'Carlos Lima', phoneEncrypted: encrypt('11 98765-1002', key, tenant.id) },
    });
    const doPaciente = await chegou('5511987651002', 'Carlinhos');
    const novo = await chegou('5511987651003', 'Desconhecida');
    expect(await c.classifyConversation(db, tenant.id, doPaciente)).toBe('patient');
    expect(await c.classifyConversation(db, tenant.id, novo)).toBe('inbox');
    expect(await get(doPaciente)).toMatchObject({ patientId: p.id, status: 'ACTIVE' });
    expect(await get(novo)).toMatchObject({ patientId: null, leadId: null, status: 'INBOX' });

    const lista = await c.listConversations(db, actor, 'all');
    const item = lista.find((x) => x.id === doPaciente)!;
    // O nome do cadastro vence o do WhatsApp; o número aparece mascarado.
    expect(item).toMatchObject({ name: 'Carlos Lima', phoneMasked: '(11) •••••-1002', preview: 'Oi!', unread: 1 });
  });

  it('aceitar a Entrada cria o lead em Novo, com origem WhatsApp e o nome de lá', async () => {
    const id = await chegou('5511987651004', 'Daniela Reis');
    await c.classifyConversation(db, tenant.id, id);
    const r = await c.acceptConversation(db, actor, id);
    if (!r.ok) throw new Error(r.message);
    const lead = await prisma.lead.findUnique({ where: { id: r.leadId }, include: { stage: true } });
    expect(lead).toMatchObject({ name: 'Daniela Reis', source: 'WHATSAPP' });
    expect(lead?.stage.role).toBe('NEW');
    expect(await get(id)).toMatchObject({ leadId: r.leadId, status: 'ACTIVE' });
    expect((await c.acceptConversation(db, actor, id)).ok).toBe(false);
  });

  it('recusar tira da Entrada; criar lead pelo funil com o número tira também', async () => {
    const recusada = await chegou('5511987651005', 'Spam');
    await c.classifyConversation(db, tenant.id, recusada);
    expect(await c.declineConversation(db, recusada)).toEqual({ ok: true });
    expect(await get(recusada)).toMatchObject({ status: 'DECLINED', unreadCount: 0 });

    const id = await chegou('5511987651006', 'Elisa');
    await c.classifyConversation(db, tenant.id, id);
    const lead = await createLead(db, actor, { name: 'Elisa Prado', phone: '11 98765-1006' });
    if (!lead.ok) throw new Error(lead.message);
    expect(await get(id)).toMatchObject({ leadId: lead.leadId, status: 'ACTIVE' });
  });

  it('abas: Entrada, Sem resposta, Minhas e busca por nome', async () => {
    const minha = await createLead(db, { tenantId: tenant.id, userId: outra.id }, { name: 'Fabiana', phone: '11 98765-1007' });
    if (!minha.ok) throw new Error(minha.message);
    const id = await chegou('5511987651007', 'Fabi');
    await c.classifyConversation(db, tenant.id, id);

    const ids = async (tab: 'all' | 'mine' | 'unanswered' | 'inbox', q = '', who = outra.id) =>
      (await c.listConversations(db, { tenantId: tenant.id, userId: who }, tab, q)).map((x) => x.id);
    expect(await ids('mine')).toEqual([id]);
    expect(await ids('mine', '', user.id)).not.toContain(id);
    expect(await ids('unanswered')).toContain(id);
    expect(await ids('inbox')).not.toContain(id);
    expect(await ids('all', 'fabiana')).toEqual([id]);
    expect(await ids('all', '11 98765-1007')).toEqual([id]);
    // Recusada não aparece em lugar nenhum.
    expect((await c.listConversations(db, actor, 'all')).some((x) => x.status === 'DECLINED')).toBe(false);
  });

  it('responder grava cifrado, na fila, e zera não lidas; falhou volta para a fila', async () => {
    const id = await chegou('5511987651008', 'Gabi');
    const r = await c.writeChatMessage(db, actor, id, '  Oi Gabi! Tenho terça às 15h  ');
    if (!r.ok) throw new Error(r.message);
    const msg = await prisma.chatMessage.findUnique({ where: { id: r.messageId } });
    expect(msg).toMatchObject({ status: 'PENDING', origin: 'CRM', direction: 'OUTBOUND', sentById: user.id });
    expect(msg?.externalId).toMatch(/^3EB0[0-9A-F]{18}$/);
    expect(msg?.textEncrypted).not.toContain('Gabi');
    expect(await get(id)).toMatchObject({ unreadCount: 0, awaitingReply: false });

    const thread = await c.loadThread(db, tenant.id, id);
    expect(thread?.messages.map((m) => [m.origin, m.text])).toEqual([
      ['CONTACT', 'Oi!'],
      ['CRM', 'Oi Gabi! Tenho terça às 15h'],
    ]);
    expect(thread?.messages[1].sentBy).toBe('Recepção');

    await c.simulateSent(db, r.messageId);
    expect((await prisma.chatMessage.findUnique({ where: { id: r.messageId } }))?.status).toBe('SENT');

    await prisma.chatMessage.update({ where: { id: r.messageId }, data: { status: 'FAILED', errorMessage: 'x' } });
    expect(await c.retryChatMessage(db, r.messageId)).toEqual({ ok: true });
    const de_novo = await prisma.chatMessage.findUnique({ where: { id: r.messageId } });
    expect(de_novo).toMatchObject({ status: 'PENDING', errorMessage: null, attempts: 0 });
    expect(de_novo?.externalId).not.toBe(msg?.externalId);

    expect((await c.writeChatMessage(db, actor, id, '   ')).ok).toBe(false);
  });

  it('lead sem conversa ganha uma ao escrever; converter em paciente liga o paciente', async () => {
    const lead = await createLead(db, actor, { name: 'Helena', phone: '11 98765-1009' });
    if (!lead.ok) throw new Error(lead.message);
    expect(await c.conversationIdForLead(db, tenant.id, lead.leadId)).toBeNull();
    const a = await c.ensureConversationForLead(db, tenant.id, lead.leadId);
    const b = await c.ensureConversationForLead(db, tenant.id, lead.leadId);
    if (!a.ok || !b.ok) throw new Error('sem conversa');
    expect(a.conversationId).toBe(b.conversationId);

    const p = await prisma.patient.create({
      data: { tenantId: tenant.id, controlNumber: 2, name: 'Helena Costa', phoneEncrypted: encrypt('11 98765-1009', key, tenant.id) },
    });
    await linkPatient(db, actor, lead.leadId, p.id, 'converted');
    expect((await get(a.conversationId))?.patientId).toBe(p.id);
  });

  it('ligar a Entrada a um paciente que escreveu de outro número', async () => {
    const p = await prisma.patient.create({
      data: { tenantId: tenant.id, controlNumber: 3, name: 'Iara', phoneEncrypted: encrypt('11 98765-1010', key, tenant.id) },
    });
    const id = await chegou('5521987651011', 'Iara (trabalho)');
    await c.classifyConversation(db, tenant.id, id);
    expect(await c.linkConversation(db, id, { patientId: p.id })).toEqual({ ok: true });
    expect(await get(id)).toMatchObject({ patientId: p.id, status: 'ACTIVE' });
  });
});
