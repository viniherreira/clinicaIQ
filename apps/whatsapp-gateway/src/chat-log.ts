/**
 * As conversas do CRM: cada mensagem 1:1 da linha da clínica, entrando ou
 * saindo, gravada para o CRM mostrar e responder.
 *
 * Só para clínicas com o CRM ligado. Nada aqui pode derrubar o socket nem
 * atrasar a confirmação de consulta: tudo devolve um motivo em vez de lançar.
 */
import { ACK_TO_STATUS, ackAdvances } from './ack-progress.js';
import { describeMessage, messageTime, previewOf } from './chat-describe.js';
import { encrypt, hashForTenant, prisma } from './db.js';
import { env } from './env.js';
import { chatKey } from './phone.js';

// ─── CRM ligado? ──────────────────────────────────────────────────────────────

const CRM_TTL_MS = 60_000;
const crmCache = new Map<string, { on: boolean; at: number }>();

/** Consulta em cache: a linha recebe muitas mensagens e o CRM liga raramente. */
export async function crmEnabled(tenantId: string): Promise<boolean> {
  const hit = crmCache.get(tenantId);
  if (hit && Date.now() - hit.at < CRM_TTL_MS) return hit.on;
  const sub = await prisma.subscription
    .findUnique({ where: { tenantId }, select: { crmEnabled: true } })
    .catch(() => null);
  const on = Boolean(sub?.crmEnabled);
  crmCache.set(tenantId, { on, at: Date.now() });
  return on;
}

// ─── Quem mandou o que sai da linha ───────────────────────────────────────────

export type OwnOrigin = 'CRM' | 'AUTOMATION';
const OWN_TTL_MS = 10 * 60_000;
const ownSends = new Map<string, { origin: OwnOrigin; at: number }>();

/**
 * Anota a origem de uma mensagem que o próprio gateway vai mandar, pelo id que
 * ela vai ter. O WhatsApp devolve a mensagem pelo `messages.upsert` como se
 * fosse qualquer outra; sem a anotação, ela seria tratada como escrita no
 * celular.
 */
export function markOwnSend(messageId: string, origin: OwnOrigin): void {
  const now = Date.now();
  if (ownSends.size > 1000) {
    for (const [id, v] of ownSends) if (now - v.at > OWN_TTL_MS) ownSends.delete(id);
  }
  ownSends.set(messageId, { origin, at: now });
}

function takeOwnOrigin(messageId: string): OwnOrigin | null {
  const hit = ownSends.get(messageId);
  if (!hit) return null;
  ownSends.delete(messageId);
  return hit.origin;
}

/** Para os testes. */
export function resetChatCaches(): void {
  crmCache.clear();
  ownSends.clear();
}

// ─── Gravar ───────────────────────────────────────────────────────────────────

export interface IncomingChat {
  /** Id da mensagem no WhatsApp. */
  externalId: string;
  fromMe: boolean;
  /** Telefone do contato, só dígitos (do jid). */
  phone: string;
  /** Nome que o contato usa no WhatsApp. */
  pushName?: string | null;
  message: unknown;
  timestamp: unknown;
}

export type RecordResult =
  | { recorded: true; conversationId: string; needsClassification: boolean }
  | { recorded: false; reason: 'not-chat' | 'crm-off' | 'no-phone' | 'duplicate' | 'error' };

export async function recordChatMessage(
  tenantId: string,
  input: IncomingChat,
  now: Date = new Date(),
): Promise<RecordResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = describeMessage(input.message as any);
    if (!entry || !input.externalId) return { recorded: false, reason: 'not-chat' };
    if (!(await crmEnabled(tenantId))) return { recorded: false, reason: 'crm-off' };

    const key = chatKey(input.phone);
    if (!/^\d{10,15}$/.test(key)) return { recorded: false, reason: 'no-phone' };

    const masterKey = env.ENCRYPTION_MASTER_KEY;
    const phoneHash = hashForTenant(key, masterKey, tenantId);
    const at = messageTime(input.timestamp, now);
    const origin = input.fromMe ? takeOwnOrigin(input.externalId) ?? 'PHONE' : 'CONTACT';
    const name = input.fromMe ? null : input.pushName?.trim() || null;

    const conv = await prisma.conversation.upsert({
      where: { tenantId_phoneHash: { tenantId, phoneHash } },
      create: {
        tenantId,
        phoneHash,
        phoneEncrypted: encrypt(key, masterKey, tenantId),
        contactName: name,
        lastMessageAt: at,
      },
      update: {},
      select: { id: true, lastMessageAt: true, classifiedAt: true, status: true, contactName: true },
    });

    // Sem duplicar: a mesma mensagem volta pelo `append` e numa reconexão, e a
    // escrita pelo CRM já existe antes de sair.
    const { count } = await prisma.chatMessage.createMany({
      data: [
        {
          tenantId,
          conversationId: conv.id,
          direction: input.fromMe ? 'OUTBOUND' : 'INBOUND',
          origin,
          kind: entry.kind,
          textEncrypted: entry.text ? encrypt(entry.text, masterKey, tenantId) : null,
          externalId: input.externalId,
          status: 'SENT',
          at,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return { recorded: false, reason: 'duplicate' };

    // Só a mensagem mais nova mexe no resumo: o que chega atrasado (uma
    // reconexão devolvendo o que já passou) entra na conversa e pronto.
    const newest = at.getTime() >= conv.lastMessageAt.getTime();
    const data: Record<string, unknown> = {};
    if (newest) {
      data.lastMessageAt = at;
      data.lastPreviewEncrypted = encrypt(previewOf(entry), masterKey, tenantId);
    }
    if (origin === 'CONTACT') {
      if (newest) {
        data.unreadCount = { increment: 1 };
        data.awaitingReply = true;
      }
      if (name && name !== conv.contactName) data.contactName = name;
      // Recusada que escreve de novo volta para a Entrada.
      if (conv.status === 'DECLINED') data.status = 'INBOX';
    } else if (origin === 'PHONE' && newest) {
      // Quem respondeu pelo celular leu.
      data.unreadCount = 0;
      data.awaitingReply = false;
    }
    if (Object.keys(data).length > 0) {
      await prisma.conversation.update({ where: { id: conv.id }, data });
    }

    return { recorded: true, conversationId: conv.id, needsClassification: conv.classifiedAt === null };
  } catch (error) {
    console.error('[gateway] conversa nao gravada:', error instanceof Error ? error.message : error);
    return { recorded: false, reason: 'error' };
  }
}

// ─── Acks ─────────────────────────────────────────────────────────────────────

/** Enviada, entregue, lida — só para frente, como nos lembretes. */
export async function applyChatAck(tenantId: string, externalId: string, ack: number): Promise<void> {
  const mapped = ACK_TO_STATUS[ack];
  if (!mapped) return;
  const row = await prisma.chatMessage
    .findUnique({ where: { tenantId_externalId: { tenantId, externalId } }, select: { id: true, status: true } })
    .catch(() => null);
  if (!row || !ackAdvances(row.status, mapped)) return;
  await prisma.chatMessage
    .updateMany({
      where: { id: row.id, status: row.status },
      data: {
        status: mapped,
        ...(mapped === 'FAILED' ? { errorMessage: 'O WhatsApp recusou a mensagem.' } : {}),
      },
    })
    .catch(() => undefined);
}

// ─── Aviso ao app ─────────────────────────────────────────────────────────────

/**
 * Conversa nova: o app liga ao lead ou ao paciente (ou manda para a Entrada).
 * Melhor esforço — se falhar, o app classifica quando alguém abrir a tela.
 */
export async function notifyConversation(tenantId: string, conversationId: string): Promise<void> {
  if (!env.APP_URL) return;
  await fetch(`${env.APP_URL}/api/whatsapp/conversation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GATEWAY_TOKEN}` },
    body: JSON.stringify({ tenantId, conversationId }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
