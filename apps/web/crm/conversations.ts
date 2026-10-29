import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, prisma, type Prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { chatKey } from '@/lib/phone';
import { activeCloudAccount, WINDOW_MS, windowOpen } from './cloud';
import { previewText } from './chat-ingest';
import { createLead, OPEN_LEAD, setTags, softDeleteLead, type Actor } from './leads';
import { conversationHash, conversationHashes, decryptPhone, leadHashesForChat, maskPhone } from './phone';
import { conversationScope, type Viewer } from './scope-rules';
import { needsSignature, readCrmPrefs, signText } from './crm-prefs';

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
  const hashes = phone ? leadHashesForChat(phone, tenantId) : [];
  let lead = phone
    ? await db.lead.findFirst({
        where: { phoneHash: { in: hashes }, ...OPEN_LEAD },
        orderBy: { createdAt: 'desc' },
        select: { id: true, patientId: true, assignedToId: true },
      })
    : null;
  const t = phone
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true, subscription: { select: { clinicEnabled: true, complimentary: true } } },
      })
    : null;
  // "Volta para o último negócio, mesmo fechado" (Configurações › Geral): sem
  // negócio aberto, a conversa entra no último que o contato teve.
  if (!lead && phone) {
    if (readCrmPrefs(t?.settings).reuseClosedLead) {
      lead = await db.lead.findFirst({
        where: { phoneHash: { in: hashes }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, patientId: true, assignedToId: true },
      });
    }
  }
  // Só com o CRM não há ficha de paciente para abrir: o contato entra no funil
  // como qualquer outro, mesmo que um dia tenha sido paciente da clínica.
  const sub = t?.subscription;
  const agenda = !sub || sub.clinicEnabled || sub.complimentary;
  const patientId = lead?.patientId ?? (phone && agenda ? await findPatientForChat(db, tenantId, phone) : null);
  const known = Boolean(lead || patientId);

  // updateMany com `classifiedAt: null`: o aviso do gateway e a tela podem chegar juntos.
  await db.conversation.updateMany({
    where: { id: conv.id, classifiedAt: null },
    data: {
      classifiedAt: now,
      leadId: lead?.id ?? null,
      patientId,
      // A conversa fica com quem já atende o negócio.
      ...(lead?.assignedToId ? { assignedToId: lead.assignedToId } : {}),
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

/** `inbox` (a antiga Entrada) fica só para consulta interna: número novo já vira lead. */
export type InboxTab = 'all' | 'mine' | 'unassigned' | 'unanswered' | 'inbox';
export const INBOX_TABS: readonly InboxTab[] = ['all', 'mine', 'unassigned', 'unanswered'];

export interface ConversationSummary {
  id: string;
  /** Paciente, lead, nome do WhatsApp ou o número mascarado, nessa ordem. */
  name: string;
  contactName: string | null;
  phoneMasked: string;
  preview: string;
  /** Quem mandou a última mensagem, se foi a clínica ("Ana", "Robô"); null se foi o contato. Só na lista. */
  previewFrom: string | null;
  lastMessageAt: string;
  unread: number;
  awaitingReply: boolean;
  status: 'INBOX' | 'ACTIVE' | 'DECLINED';
  lead: { id: string; label: string; stage: string; stageColor: string; assignee: string | null; open: boolean } | null;
  patient: { id: string; name: string } | null;
  /** As tags do lead, na ordem do nome (aparecem na lista, como no Kommo). */
  tags: { id: string; name: string; color: string }[];
  /** Quem atende a conversa (`crm/assignment.ts`). */
  assignedTo: { id: string; name: string } | null;
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
      stage: { select: { name: true, color: true } },
      assignedTo: { select: { name: true } },
      tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
    },
  },
  patient: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.ConversationInclude;

type SummaryRow = Prisma.ConversationGetPayload<{ include: typeof summaryInclude }>;

/** `agenda: false` (clínica só com o CRM): sem ficha de paciente para mostrar. */
function toSummary(r: SummaryRow, tenantId: string, agenda = true): ConversationSummary {
  const phone = decryptPhone(r.phoneEncrypted, tenantId);
  const masked = maskPhone(phone);
  const lead = r.lead && !r.lead.deletedAt ? r.lead : null;
  return {
    id: r.id,
    name: (agenda ? r.patient?.name : null) ?? lead?.name ?? r.contactName ?? masked,
    contactName: r.contactName,
    phoneMasked: masked,
    preview: open(r.lastPreviewEncrypted, tenantId),
    previewFrom: null,
    lastMessageAt: r.lastMessageAt.toISOString(),
    unread: r.unreadCount,
    awaitingReply: r.awaitingReply,
    status: r.status,
    lead: lead
      ? {
          id: lead.id,
          label: lead.title || lead.name,
          stage: lead.wonAt ? 'Fechou' : lead.lostAt ? 'Perdeu' : lead.stage.name,
          stageColor: lead.wonAt ? 'green' : lead.lostAt ? 'red' : lead.stage.color,
          assignee: lead.assignedTo?.name ?? null,
          open: !lead.wonAt && !lead.lostAt,
        }
      : null,
    patient: agenda ? r.patient : null,
    tags: (lead?.tags ?? []).map((t) => t.tag).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    assignedTo: r.assignedTo,
  };
}

export function conversationWhere(
  ctx: { tenantId: string } & Viewer,
  tab: InboxTab,
  q: string,
  tagId: string | null = null,
): Prisma.ConversationWhereInput {
  const where: Prisma.ConversationWhereInput = { status: { not: 'DECLINED' } };
  const and: Prisma.ConversationWhereInput[] = [];
  // Atendente "só os dele": as suas e as sem responsável.
  const escopo = conversationScope(ctx);
  if (escopo) and.push(escopo);
  // Filtro por tag: só conversas ligadas a um lead com a tag.
  if (tagId) and.push({ lead: { deletedAt: null, tags: { some: { tagId } } } });
  if (and.length) where.AND = and;
  if (tab === 'inbox') where.status = 'INBOX';
  if (tab === 'mine') where.assignedToId = ctx.userId;
  if (tab === 'unassigned') where.assignedToId = null;
  if (tab === 'unanswered') where.awaitingReply = true;

  const term = q.trim().slice(0, 80);
  if (term) {
    const digits = term.replace(/\D/g, '');
    where.OR =
      digits.length >= 10
        ? [{ phoneHash: { in: conversationHashes(digits, ctx.tenantId) } }]
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
  ctx: { tenantId: string; agenda?: boolean } & Viewer,
  tab: InboxTab,
  q = '',
  take = 60,
  tagId: string | null = null,
): Promise<ConversationSummary[]> {
  const rows = await db.conversation.findMany({
    where: conversationWhere(ctx, tab, q, tagId),
    include: summaryInclude,
    orderBy: { lastMessageAt: 'desc' },
    take,
  });
  const lista = rows.map((r) => toSummary(r, ctx.tenantId, ctx.agenda));
  if (lista.length === 0) return lista;
  // Quem mandou a última de cada conversa ("Ana: Tenho às 15h", "Robô: Olá!"), como no Kommo.
  const ultimas = await db.$queryRaw<{ conversationId: string; direction: string; origin: string; name: string | null }[]>`
    SELECT DISTINCT ON (m."conversationId") m."conversationId", m."direction"::text AS direction, m."origin"::text AS origin, u."name"
    FROM "chat_messages" m
    LEFT JOIN "users" u ON u."id" = m."sentById"
    WHERE m."tenantId" = ${ctx.tenantId} AND m."conversationId" = ANY(${lista.map((c) => c.id)})
    ORDER BY m."conversationId", m."at" DESC, m."createdAt" DESC`;
  const de = new Map(ultimas.map((u) => [u.conversationId, previewAuthor(u)]));
  for (const c of lista) c.previewFrom = de.get(c.id) ?? null;
  return lista;
}

function previewAuthor(m: { direction: string; origin: string; name: string | null }): string | null {
  if (m.direction === 'INBOUND') return null;
  if (m.origin === 'BOT') return 'Robô';
  if (m.origin === 'AUTOMATION') return 'Automático';
  if (m.origin === 'BROADCAST') return 'Transmissão';
  if (m.origin === 'PHONE') return 'Celular da clínica';
  return m.name?.split(' ')[0] ?? 'Equipe';
}

/** Os números das abas e do menu. */
export async function inboxCounts(
  db: TenantPrismaClient,
  viewer?: Viewer,
): Promise<{ unread: number; inbox: number; mine: number; unassigned: number }> {
  const escopo = viewer ? conversationScope(viewer) : null;
  const base: Prisma.ConversationWhereInput = { status: { not: 'DECLINED' }, ...(escopo ? { AND: [escopo] } : {}) };
  const [unread, inbox, mine, unassigned] = await Promise.all([
    db.conversation.count({ where: { ...base, unreadCount: { gt: 0 } } }),
    db.conversation.count({ where: { ...base, status: 'INBOX' } }),
    viewer ? db.conversation.count({ where: { ...base, assignedToId: viewer.userId, unreadCount: { gt: 0 } } }) : 0,
    db.conversation.count({ where: { ...base, assignedToId: null } }),
  ]);
  return { unread, inbox, mine, unassigned };
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
  /** Botões que foram junto (robô): a equipe vê o que a pessoa podia tocar. */
  buttons: string[];
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
  /** Dá para mandar arquivo por este canal. */
  mediaOk: boolean;
  /** O robô que está conversando agora (ou esperando a resposta da pessoa). */
  bot: { id: string; name: string } | null;
  /** Quando fecha a janela de 24 h (ISO), se aberta. */
  windowEndsAt: string | null;
}

const THREAD_LIMIT = 200;

export async function loadThread(
  db: TenantPrismaClient,
  tenantId: string,
  conversationId: string,
  /** Quem olha: o Atendente "só os dele" não abre conversa de outra pessoa. */
  viewer?: Viewer,
  /** A clínica tem a agenda (só com o CRM, a conversa não mostra ficha de paciente). */
  agenda = true,
): Promise<ChatThread | null> {
  const escopo = viewer ? conversationScope(viewer) : null;
  const conv = await db.conversation.findFirst({ where: { id: conversationId, ...(escopo ? { AND: [escopo] } : {}) }, include: summaryInclude });
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
      buttons: Array.isArray(m.buttons) ? (m.buttons as { title?: unknown }[]).map((b) => String(b?.title ?? '')).filter(Boolean) : [],
    }));
  const [cloud, bot] = await Promise.all([
    activeCloudAccount(tenantId),
    conv.botFlowId ? db.chatbotFlow.findFirst({ where: { id: conv.botFlowId }, select: { id: true, name: true } }) : null,
  ]);
  return {
    conversation: toSummary(conv, tenantId, agenda),
    messages,
    truncated,
    channel: cloud ? 'cloud' : 'gateway',
    windowOpen: windowOpen(conv.lastInboundAt),
    // Arquivo sai pela API oficial; sem canal nenhum (desenvolvimento), é simulado.
    mediaOk: Boolean(cloud) || (!process.env.WHATSAPP_GATEWAY_URL && process.env.NODE_ENV !== 'production'),
    bot,
    windowEndsAt: conv.lastInboundAt && windowOpen(conv.lastInboundAt) ? new Date(conv.lastInboundAt.getTime() + WINDOW_MS).toISOString() : null,
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
  const byPhone = await db.conversation.findFirst({ where: { phoneHash: { in: conversationHashes(phone, tenantId) } }, select: { id: true } });
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
    const again = await db.conversation.findFirst({ where: { phoneHash: { in: conversationHashes(key, tenantId) } }, select: { id: true } });
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
  /** Arquivo já guardado (`crm/media-store.ts`); o `text` vira a legenda, que pode faltar. */
  media?: { kind: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO'; ref: string; mimeType: string };
  /** "Mostrar nome do remetente" (Configurações › Conversas): o nome de quem responde, quando a regra pede. */
  signAs?: string | null;
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
  // Áudio vai sem legenda: o WhatsApp não mostra.
  const text = opts.media?.kind === 'AUDIO' ? '' : rawText.trim();
  if (!text && !opts.media) return { ok: false, message: 'Escreva a mensagem.' };
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
    // A assinatura vai na primeira de quem responde e de novo depois que o contato (ou um colega) fala.
    let body = text;
    if (opts.signAs && origin === 'CRM' && actor.userId && text) {
      const last = await tx.chatMessage.findFirst({
        where: { conversationId },
        orderBy: [{ at: 'desc' }, { createdAt: 'desc' }],
        select: { direction: true, origin: true, sentById: true },
      });
      if (needsSignature(last, actor.userId)) body = signText(opts.signAs, text);
    }
    const created = await tx.chatMessage.create({
      data: {
        tenantId,
        conversationId,
        direction: 'OUTBOUND',
        origin,
        kind: opts.media?.kind ?? 'TEXT',
        textEncrypted: body ? seal(body, tenantId) : null,
        ...(opts.media ? { mediaRef: opts.media.ref, mimeType: opts.media.mimeType } : {}),
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
          lastPreviewEncrypted: seal(previewText(opts.media?.kind ?? 'TEXT', body || null), tenantId),
          // Quem responde é a equipe: leu, respondeu e o robô sai da conversa.
          ...(origin === 'CRM'
            ? { unreadCount: 0, awaitingReply: false, botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0, botWakeAt: null }
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
 * vira lead em Novo, com origem WhatsApp e o nome que a pessoa usa lá. Pelo
 * painel ao lado da conversa dá para escolher nome, funil, etapa e tags.
 */
export async function acceptConversation(
  db: TenantPrismaClient,
  /** `userId: null`: número novo aceito sozinho ao chegar (`crm/inbound.ts`). */
  actor: Actor,
  conversationId: string,
  opts: { name?: string; stageId?: string | null; pipelineId?: string | null; tagIds?: string[] } = {},
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
    name: opts.name?.trim() || (conv.patient?.name ?? conv.contactName ?? 'Contato do WhatsApp'),
    phone,
    source: 'WHATSAPP',
    patientId: conv.patientId,
    stageId: opts.stageId || null,
    pipelineId: opts.pipelineId || null,
  });
  if (!r.ok) return r;
  if (opts.tagIds?.length) await setTags(db, actor, r.leadId, opts.tagIds);
  // createLead já liga pela chave do número; garante mesmo se o número da
  // conversa e o do lead diferirem na forma.
  await db.conversation.update({
    where: { id: conv.id, tenantId: actor.tenantId },
    data: { leadId: r.leadId, status: 'ACTIVE', classifiedAt: new Date() },
  });
  return r;
}

/**
 * Arquivar uma conversa sem negócio aberto (spam, engano). Some da lista; se a
 * pessoa escrever de novo, volta sem lead (`chat-ingest.ts`).
 */
export async function declineConversation(
  db: TenantPrismaClient,
  conversationId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const conv = await db.conversation.findFirst({
    where: { id: conversationId, status: { not: 'DECLINED' } },
    select: { id: true, lead: { select: { ...OPEN_LEAD_SELECT } } },
  });
  if (!conv) return { ok: false, message: 'Esta conversa já foi arquivada.' };
  if (conv.lead && isOpen(conv.lead)) return { ok: false, message: 'Esta conversa tem um negócio aberto. Use "Não é lead" no negócio.' };
  await db.conversation.updateMany({
    where: { id: conversationId },
    data: { status: 'DECLINED', unreadCount: 0, awaitingReply: false },
  });
  return { ok: true };
}

/**
 * "Não é lead": o card criado sozinho para um número que não é cliente (spam,
 * fornecedor, engano). Tira o lead do funil e arquiva a conversa.
 */
export async function notALead(
  db: TenantPrismaClient,
  actor: Actor,
  conversationId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const conv = await db.conversation.findFirst({
    where: { id: conversationId },
    select: { id: true, leadId: true, lead: { select: { ...OPEN_LEAD_SELECT } } },
  });
  if (!conv?.leadId || !conv.lead || !isOpen(conv.lead)) return { ok: false, message: 'Esta conversa não tem negócio aberto.' };
  const r = await softDeleteLead(db, actor, conv.leadId);
  if (!r.ok) return r;
  await db.conversation.updateMany({
    where: { id: conv.id },
    data: { leadId: null, status: 'DECLINED', unreadCount: 0, awaitingReply: false },
  });
  return { ok: true };
}

const OPEN_LEAD_SELECT = { wonAt: true, lostAt: true, deletedAt: true } as const;
const isOpen = (l: { wonAt: Date | null; lostAt: Date | null; deletedAt: Date | null }) => !l.wonAt && !l.lostAt && !l.deletedAt;

/** Ligar a um lead ou paciente que já existe (a pessoa escreveu de outro número). */
export async function linkConversation(
  db: TenantPrismaClient,
  conversationId: string,
  target: { leadId: string } | { patientId: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const conv = await db.conversation.findFirst({ where: { id: conversationId }, select: { id: true, tenantId: true } });
  if (!conv) return { ok: false, message: 'Conversa não encontrada.' };

  if ('leadId' in target) {
    const lead = await db.lead.findFirst({
      where: { id: target.leadId, deletedAt: null },
      select: { id: true, patientId: true, assignedToId: true },
    });
    if (!lead) return { ok: false, message: 'Lead não encontrado.' };
    await db.conversation.update({
      where: { id: conv.id, tenantId: conv.tenantId },
      data: {
        leadId: lead.id,
        patientId: lead.patientId ?? undefined,
        status: 'ACTIVE',
        classifiedAt: new Date(),
        ...(lead.assignedToId ? { assignedToId: lead.assignedToId } : {}),
      },
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
