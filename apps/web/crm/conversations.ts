import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, type Prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { chatKey } from '@/lib/phone';
import { activeCloudAccount, windowOpen } from './cloud';
import { createLead, OPEN_LEAD, type Actor } from './leads';
import { conversationHash, decryptPhone, leadHashesForChat, maskPhone } from './phone';

/**
 * As conversas do WhatsApp no CRM. O gateway grava o que entra e sai da linha
 * da clínica; aqui ficam as regras do lado do app: ligar a conversa ao lead ou
 * ao paciente, listar, abrir, responder, aceitar e recusar a Entrada.
 *
 * Quem chama já passou pela guarda. O `db` é o da clínica.
 */

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

const seal = (text: string, tenantId: string) => encrypt(text, masterKey(), tenantId);
function open(cipher: string | null, tenantId: string): string {
  if (!cipher) return '';
  try {
    return decrypt(cipher, masterKey(), tenantId);
  } catch {
    return '';
  }
}

/** Id de mensagem no formato do WhatsApp. Escolhido aqui para o envio poder repetir sem duplicar. */
export function newMessageId(): string {
  return `3EB0${randomBytes(9).toString('hex').toUpperCase()}`;
}

export const MAX_CHAT_TEXT = 4096;

// ─── Ligar a lead ou paciente ─────────────────────────────────────────────────

const PATIENT_CACHE_MS = 60_000;
const patientKeys = new Map<string, { at: number; byKey: Map<string, string> }>();

/**
 * Paciente com esse número (principal ou secundário). Pacientes não têm índice
 * cego: decifra os telefones da clínica uma vez e guarda por um minuto, porque
 * uma campanha cria várias conversas de uma vez.
 */
export async function findPatientForChat(db: TenantPrismaClient, tenantId: string, phone: string): Promise<string | null> {
  const key = chatKey(phone);
  if (!key) return null;
  let hit = patientKeys.get(tenantId);
  if (!hit || Date.now() - hit.at > PATIENT_CACHE_MS) {
    const rows = await db.patient.findMany({
      where: { deletedAt: null },
      select: { id: true, phoneEncrypted: true, phone2Encrypted: true },
      orderBy: { createdAt: 'asc' },
    });
    const byKey = new Map<string, string>();
    for (const p of rows) {
      for (const cipher of [p.phoneEncrypted, p.phone2Encrypted]) {
        const k = cipher ? chatKey(decryptPhone(cipher, tenantId)) : '';
        // O mais antigo fica: é o cadastro de verdade, o resto costuma ser duplicado.
        if (k && !byKey.has(k)) byKey.set(k, p.id);
      }
    }
    hit = { at: Date.now(), byKey };
    patientKeys.set(tenantId, hit);
  }
  return hit.byKey.get(key) ?? null;
}

/** Para os testes: esquece os telefones de pacientes guardados. */
export function forgetPatientKeys(): void {
  patientKeys.clear();
}

/**
 * Liga uma conversa nova a quem ela é: lead aberto com o número, senão paciente,
 * senão Entrada. Roda uma vez por conversa (`classifiedAt`).
 */
export async function classifyConversation(
  db: TenantPrismaClient,
  tenantId: string,
  conversationId: string,
  now: Date = new Date(),
): Promise<'lead' | 'patient' | 'inbox' | 'skip'> {
  const conv = await db.conversation.findFirst({
    where: { id: conversationId },
    select: { id: true, phoneEncrypted: true, status: true, classifiedAt: true },
  });
  if (!conv || conv.classifiedAt) return 'skip';

  const phone = decryptPhone(conv.phoneEncrypted, tenantId);
  const lead = phone
    ? await db.lead.findFirst({
        where: { phoneHash: { in: leadHashesForChat(phone, tenantId) }, ...OPEN_LEAD },
        orderBy: { createdAt: 'desc' },
        select: { id: true, patientId: true },
      })
    : null;
  const patientId = lead?.patientId ?? (phone ? await findPatientForChat(db, tenantId, phone) : null);
  const known = Boolean(lead || patientId);

  // updateMany com `classifiedAt: null`: o aviso do gateway e a tela podem chegar juntos.
  await db.conversation.updateMany({
    where: { id: conv.id, classifiedAt: null },
    data: {
      classifiedAt: now,
      leadId: lead?.id ?? null,
      patientId,
      ...(known && conv.status === 'INBOX' ? { status: 'ACTIVE' as const } : {}),
    },
  });
  return lead ? 'lead' : patientId ? 'patient' : 'inbox';
}

/** As que o aviso do gateway não alcançou. Roda quando alguém abre a tela. */
export async function classifyPending(db: TenantPrismaClient, tenantId: string): Promise<void> {
  const pending = await db.conversation.findMany({ where: { classifiedAt: null }, select: { id: true }, take: 50 });
  for (const c of pending) await classifyConversation(db, tenantId, c.id);
}

// ─── Listar ───────────────────────────────────────────────────────────────────

export type InboxTab = 'all' | 'mine' | 'unanswered' | 'inbox';
export const INBOX_TABS: readonly InboxTab[] = ['all', 'mine', 'unanswered', 'inbox'];

export interface ConversationSummary {
  id: string;
  /** Paciente, lead, nome do WhatsApp ou o número mascarado, nessa ordem. */
  name: string;
  contactName: string | null;
  phoneMasked: string;
  preview: string;
  lastMessageAt: string;
  unread: number;
  awaitingReply: boolean;
  status: 'INBOX' | 'ACTIVE' | 'DECLINED';
  lead: { id: string; label: string; stage: string; assignee: string | null; open: boolean } | null;
  patient: { id: string; name: string } | null;
}

const summaryInclude = {
  lead: {
    select: {
      id: true,
      name: true,
      title: true,
      wonAt: true,
      lostAt: true,
      deletedAt: true,
      stage: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  },
  patient: { select: { id: true, name: true } },
} satisfies Prisma.ConversationInclude;

type SummaryRow = Prisma.ConversationGetPayload<{ include: typeof summaryInclude }>;

function toSummary(r: SummaryRow, tenantId: string): ConversationSummary {
  const phone = decryptPhone(r.phoneEncrypted, tenantId);
  const masked = maskPhone(phone);
  const lead = r.lead && !r.lead.deletedAt ? r.lead : null;
  return {
    id: r.id,
    name: r.patient?.name ?? lead?.name ?? r.contactName ?? masked,
    contactName: r.contactName,
    phoneMasked: masked,
    preview: open(r.lastPreviewEncrypted, tenantId),
    lastMessageAt: r.lastMessageAt.toISOString(),
    unread: r.unreadCount,
    awaitingReply: r.awaitingReply,
    status: r.status,
    lead: lead
      ? {
          id: lead.id,
          label: lead.title || lead.name,
          stage: lead.wonAt ? 'Fechou' : lead.lostAt ? 'Perdeu' : lead.stage.name,
          assignee: lead.assignedTo?.name ?? null,
          open: !lead.wonAt && !lead.lostAt,
        }
      : null,
    patient: r.patient,
  };
}

export function conversationWhere(
  ctx: { tenantId: string; userId: string },
  tab: InboxTab,
  q: string,
): Prisma.ConversationWhereInput {
  const where: Prisma.ConversationWhereInput = { status: { not: 'DECLINED' } };
  if (tab === 'inbox') where.status = 'INBOX';
  if (tab === 'mine') where.lead = { assignedToId: ctx.userId };
  if (tab === 'unanswered') where.awaitingReply = true;

  const term = q.trim().slice(0, 80);
  if (term) {
    const digits = term.replace(/\D/g, '');
    where.OR =
      digits.length >= 10
        ? [{ phoneHash: conversationHash(digits, ctx.tenantId) }]
        : [
            { contactName: { contains: term, mode: 'insensitive' } },
            { lead: { name: { contains: term, mode: 'insensitive' } } },
            { patient: { name: { contains: term, mode: 'insensitive' } } },
          ];
  }
  return where;
}

export async function listConversations(
  db: TenantPrismaClient,
  ctx: { tenantId: string; userId: string },
  tab: InboxTab,
  q = '',
  take = 60,
): Promise<ConversationSummary[]> {
  const rows = await db.conversation.findMany({
    where: conversationWhere(ctx, tab, q),
    include: summaryInclude,
    orderBy: { lastMessageAt: 'desc' },
    take,
  });
  return rows.map((r) => toSummary(r, ctx.tenantId));
}

/** Os números das abas e do menu. */
export async function inboxCounts(db: TenantPrismaClient): Promise<{ unread: number; inbox: number }> {
  const [unread, inbox] = await Promise.all([
    db.conversation.count({ where: { status: { not: 'DECLINED' }, unreadCount: { gt: 0 } } }),
    db.conversation.count({ where: { status: 'INBOX' } }),
  ]);
  return { unread, inbox };
}

// ─── Abrir ────────────────────────────────────────────────────────────────────

export interface ChatLine {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  origin: 'CONTACT' | 'CRM' | 'PHONE' | 'AUTOMATION' | 'BROADCAST' | 'BOT';
  kind: string;
  text: string;
  at: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  /** Saiu do CRM e o WhatsApp já aceitou, mas ainda sem ack. */
  accepted: boolean;
  error: string | null;
  sentBy: string | null;
  /** Mídia da API oficial: dá para abrir no CRM. */
  hasMedia: boolean;
  mimeType: string | null;
  templateName: string | null;
}

export interface ChatThread {
  conversation: ConversationSummary;
  messages: ChatLine[];
  /** Há mensagens mais antigas que as mostradas. */
  truncated: boolean;
  /** Por onde a clínica responde. */
  channel: 'cloud' | 'gateway';
  /** API oficial: dá para escrever livre (24 h desde a última mensagem da pessoa). */
  windowOpen: boolean;
}

const THREAD_LIMIT = 200;

export async function loadThread(
  db: TenantPrismaClient,
  tenantId: string,
  conversationId: string,
): Promise<ChatThread | null> {
  const conv = await db.conversation.findFirst({ where: { id: conversationId }, include: summaryInclude });
  if (!conv) return null;
  const rows = await db.chatMessage.findMany({
    where: { conversationId },
    // Duas mensagens no mesmo milissegundo: a criada depois vem depois.
    orderBy: [{ at: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: THREAD_LIMIT + 1,
    include: { sentBy: { select: { name: true } } },
  });
  const truncated = rows.length > THREAD_LIMIT;
  const messages = rows
    .slice(0, THREAD_LIMIT)
    .reverse()
    .map<ChatLine>((m) => ({
      id: m.id,
      direction: m.direction,
      origin: m.origin,
      kind: m.kind,
      text: open(m.textEncrypted, tenantId),
      at: m.at.toISOString(),
      status: m.status,
      accepted: Boolean(m.acceptedAt),
      error: m.errorMessage,
      sentBy: m.sentBy?.name ?? null,
      hasMedia: Boolean(m.mediaRef),
      mimeType: m.mimeType,
      templateName: m.templateName,
    }));
  const cloud = await activeCloudAccount(tenantId);
  return {
    conversation: toSummary(conv, tenantId),
    messages,
    truncated,
    channel: cloud ? 'cloud' : 'gateway',
    windowOpen: windowOpen(conv.lastInboundAt),
  };
}

/** Quem abriu leu. Só no CRM: o celular continua mostrando como estava. */
export async function markRead(db: TenantPrismaClient, conversationId: string): Promise<void> {
  await db.conversation.updateMany({ where: { id: conversationId, unreadCount: { gt: 0 } }, data: { unreadCount: 0 } });
}

/** A conversa de um negócio: a ligada a ele, senão a do número dele. */
export async function conversationIdForLead(db: TenantPrismaClient, tenantId: string, leadId: string): Promise<string | null> {
  const linked = await db.conversation.findFirst({ where: { leadId }, select: { id: true }, orderBy: { lastMessageAt: 'desc' } });
  if (linked) return linked.id;
  const lead = await db.lead.findFirst({ where: { id: leadId, deletedAt: null }, select: { phoneEncrypted: true } });
  const phone = lead ? decryptPhone(lead.phoneEncrypted, tenantId) : '';
  if (!phone) return null;
  const byPhone = await db.conversation.findFirst({ where: { phoneHash: conversationHash(phone, tenantId) }, select: { id: true } });
  return byPhone?.id ?? null;
}

/**
 * Para escrever a um lead que ainda não tem conversa: cria a conversa com o
 * número dele, já ligada.
 */
export async function ensureConversationForLead(
  db: TenantPrismaClient,
  tenantId: string,
  leadId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; message: string }> {
  const existing = await conversationIdForLead(db, tenantId, leadId);
  if (existing) return { ok: true, conversationId: existing };
  const lead = await db.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true, phoneEncrypted: true, patientId: true },
  });
  if (!lead) return { ok: false, message: 'Lead não encontrado.' };
  const key = chatKey(decryptPhone(lead.phoneEncrypted, tenantId));
  if (!/^\d{12,15}$/.test(key)) return { ok: false, message: 'O telefone do lead não serve para WhatsApp. Confira o cadastro.' };

  const phoneHash = conversationHash(key, tenantId);
  try {
    const conv = await db.conversation.create({
      data: {
        tenantId,
        phoneHash,
        phoneEncrypted: seal(key, tenantId),
        status: 'ACTIVE',
        leadId: lead.id,
        patientId: lead.patientId,
        classifiedAt: new Date(),
      },
      select: { id: true },
    });
    return { ok: true, conversationId: conv.id };
  } catch {
    // A pessoa escreveu no mesmo instante e o gateway criou primeiro.
    const again = await db.conversation.findFirst({ where: { phoneHash }, select: { id: true } });
    return again ? { ok: true, conversationId: again.id } : { ok: false, message: 'Não foi possível abrir a conversa.' };
  }
}

// ─── Responder ────────────────────────────────────────────────────────────────

export interface WriteOptions {
  /** Quem escreve: a equipe (padrão), o robô ou uma transmissão. */
  origin?: 'CRM' | 'BOT' | 'BROADCAST';
  /** Modelo aprovado (API oficial). O `text` é o corpo já preenchido, para a tela. */
  template?: { name: string; lang: string; params: string[] };
  /** Opções do robô. */
  buttons?: { id: string; title: string }[];
  /** Na API oficial, recusa texto livre fora da janela de 24 horas. */
  checkWindow?: boolean;
  /** Quando sai (transmissão espaçada). Padrão: agora. */
  sendAt?: Date;
}

export const WINDOW_CLOSED_MESSAGE = 'Passaram 24 horas desde a última mensagem da pessoa. Na API oficial, use um modelo aprovado.';

export async function writeChatMessage(
  db: TenantPrismaClient,
  actor: { tenantId: string; userId: string | null },
  conversationId: string,
  rawText: string,
  now: Date = new Date(),
  opts: WriteOptions = {},
): Promise<{ ok: true; messageId: string } | { ok: false; message: string }> {
  const text = rawText.trim();
  if (!text) return { ok: false, message: 'Escreva a mensagem.' };
  if (text.length > MAX_CHAT_TEXT) return { ok: false, message: `A mensagem passa de ${MAX_CHAT_TEXT} caracteres.` };

  const { tenantId } = actor;
  const conv = await db.conversation.findFirst({ where: { id: conversationId }, select: { id: true, status: true, lastInboundAt: true } });
  if (!conv) return { ok: false, message: 'Conversa não encontrada.' };
  if (conv.status === 'DECLINED') return { ok: false, message: 'Esta conversa foi recusada.' };
  if (opts.checkWindow && !opts.template && !windowOpen(conv.lastInboundAt, now)) {
    return { ok: false, message: WINDOW_CLOSED_MESSAGE };
  }

  const origin = opts.origin ?? 'CRM';
  const sendAt = opts.sendAt ?? now;
  const later = sendAt.getTime() > now.getTime();
  const msg = await db.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        tenantId,
        conversationId,
        direction: 'OUTBOUND',
        origin,
        kind: 'TEXT',
        textEncrypted: seal(text, tenantId),
        externalId: newMessageId(),
        status: 'PENDING',
        sentById: origin === 'CRM' ? actor.userId : null,
        at: sendAt,
        ...(later ? { nextAttemptAt: sendAt } : {}),
        ...(opts.template
          ? { templateName: opts.template.name, templateLang: opts.template.lang, templateParams: opts.template.params }
          : {}),
        ...(opts.buttons?.length ? { buttons: opts.buttons } : {}),
      },
      select: { id: true },
    });
    // Mensagem para depois (transmissão) só aparece na lista quando sair.
    if (!later) {
      await tx.conversation.update({
        where: { id: conversationId, tenantId },
        data: {
          lastMessageAt: now,
          lastPreviewEncrypted: seal(text.replace(/\s+/g, ' ').slice(0, 120), tenantId),
          // Quem responde é a equipe: leu, respondeu e o robô sai da conversa.
          ...(origin === 'CRM'
            ? { unreadCount: 0, awaitingReply: false, botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0 }
            : {}),
        },
      });
    }
    return created;
  });
  return { ok: true, messageId: msg.id };
}

/** Falhou: volta para a fila com um id novo, como se fosse escrita agora. */
export async function retryChatMessage(
  db: TenantPrismaClient,
  chatMessageId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { count } = await db.chatMessage.updateMany({
    where: { id: chatMessageId, origin: 'CRM', status: 'FAILED' },
    data: {
      status: 'PENDING',
      externalId: newMessageId(),
      acceptedAt: null,
      attempts: 0,
      nextAttemptAt: null,
      claimedUntil: null,
      errorMessage: null,
      at: now,
      createdAt: now,
    },
  });
  return count ? { ok: true } : { ok: false, message: 'Esta mensagem não pode ser reenviada.' };
}

/**
 * Sem gateway (desenvolvimento e testes) a mensagem "sai" na hora — senão a tela
 * ficaria com o relógio para sempre.
 */
export async function simulateSent(db: TenantPrismaClient, chatMessageId: string): Promise<void> {
  await db.chatMessage.updateMany({
    where: { id: chatMessageId, status: 'PENDING' },
    data: { status: 'SENT', acceptedAt: new Date(), attempts: 1 },
  });
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

/**
 * Aceitar (Entrada) ou "Criar negócio" (conversa de paciente sem negócio aberto):
 * vira lead em Novo, com origem WhatsApp e o nome que a pessoa usa lá.
 */
export async function acceptConversation(
  db: TenantPrismaClient,
  actor: Actor & { userId: string },
  conversationId: string,
): Promise<{ ok: true; leadId: string } | { ok: false; message: string }> {
  const conv = await db.conversation.findFirst({
    where: { id: conversationId },
    select: {
      id: true,
      status: true,
      contactName: true,
      phoneEncrypted: true,
      patientId: true,
      patient: { select: { name: true } },
      lead: { select: { wonAt: true, lostAt: true, deletedAt: true } },
    },
  });
  if (!conv) return { ok: false, message: 'Conversa não encontrada.' };
  if (conv.status === 'DECLINED') return { ok: false, message: 'Esta conversa foi recusada.' };
  if (conv.lead && !conv.lead.wonAt && !conv.lead.lostAt && !conv.lead.deletedAt) {
    return { ok: false, message: 'Esta conversa já tem um negócio aberto.' };
  }

  const phone = decryptPhone(conv.phoneEncrypted, actor.tenantId);
  const r = await createLead(db, actor, {
    name: conv.patient?.name ?? conv.contactName ?? 'Contato do WhatsApp',
    phone,
    source: 'WHATSAPP',
    patientId: conv.patientId,
  });
  if (!r.ok) return r;
  // createLead já liga pela chave do número; garante mesmo se o número da
  // conversa e o do lead diferirem na forma.
  await db.conversation.update({
    where: { id: conv.id, tenantId: actor.tenantId },
    data: { leadId: r.leadId, status: 'ACTIVE', classifiedAt: new Date() },
  });
  return r;
}

export async function declineConversation(
  db: TenantPrismaClient,
  conversationId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { count } = await db.conversation.updateMany({
    where: { id: conversationId, status: 'INBOX' },
    data: { status: 'DECLINED', unreadCount: 0, awaitingReply: false },
  });
  return count ? { ok: true } : { ok: false, message: 'Esta conversa já saiu da Entrada.' };
}

/** Ligar a um lead ou paciente que já existe (a pessoa escreveu de outro número). */
export async function linkConversation(
  db: TenantPrismaClient,
  conversationId: string,
  target: { leadId: string } | { patientId: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const conv = await db.conversation.findFirst({ where: { id: conversationId }, select: { id: true, tenantId: true } });
  if (!conv) return { ok: false, message: 'Conversa não encontrada.' };

  if ('leadId' in target) {
    const lead = await db.lead.findFirst({ where: { id: target.leadId, deletedAt: null }, select: { id: true, patientId: true } });
    if (!lead) return { ok: false, message: 'Lead não encontrado.' };
    await db.conversation.update({
      where: { id: conv.id, tenantId: conv.tenantId },
      data: { leadId: lead.id, patientId: lead.patientId ?? undefined, status: 'ACTIVE', classifiedAt: new Date() },
    });
    return { ok: true };
  }
  const patient = await db.patient.findFirst({ where: { id: target.patientId, deletedAt: null }, select: { id: true } });
  if (!patient) return { ok: false, message: 'Paciente não encontrado.' };
  await db.conversation.update({
    where: { id: conv.id, tenantId: conv.tenantId },
    data: { patientId: patient.id, status: 'ACTIVE', classifiedAt: new Date() },
  });
  return { ok: true };
}
