import { encrypt, getTenantClient } from '@clinicaiq/db';
import { chatKey } from '@/lib/phone';
import { conversationHash } from './phone';

/**
 * Gravar no CRM uma mensagem que chegou pela API oficial (webhook da Meta).
 *
 * É o mesmo que o gateway faz para o QR (`apps/whatsapp-gateway/src/chat-log.ts`):
 * conversa por número, mensagem cifrada, sem duplicar pelo id do WhatsApp, e o
 * resumo da conversa só mexido pela mensagem mais nova. Mudar os dois juntos.
 */

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

const LABEL: Record<string, string> = {
  IMAGE: 'Foto',
  AUDIO: 'Áudio',
  VIDEO: 'Vídeo',
  DOCUMENT: 'Documento',
  STICKER: 'Figurinha',
  LOCATION: 'Localização',
  CONTACT: 'Contato',
  OTHER: 'Mensagem',
};

export function previewText(kind: string, text: string | null): string {
  const base = kind === 'TEXT' ? text ?? '' : [LABEL[kind] ?? 'Mensagem', text].filter(Boolean).join(': ');
  return base.replace(/\s+/g, ' ').slice(0, 120);
}

export interface IngestInput {
  externalId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  origin: 'CONTACT' | 'PHONE';
  phone: string;
  contactName?: string | null;
  kind: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'LOCATION' | 'CONTACT' | 'OTHER';
  text: string | null;
  mediaRef?: string | null;
  mimeType?: string | null;
  at: Date;
}

export type IngestResult =
  | { recorded: true; conversationId: string; messageId: string; isNew: boolean }
  | { recorded: false; reason: 'no-phone' | 'duplicate' };

export async function ingestChat(tenantId: string, input: IngestInput): Promise<IngestResult> {
  const db = getTenantClient(tenantId);
  const key = chatKey(input.phone);
  if (!/^\d{10,15}$/.test(key)) return { recorded: false, reason: 'no-phone' };
  const phoneHash = conversationHash(key, tenantId);
  const seal = (t: string) => encrypt(t, masterKey(), tenantId);
  const name = input.origin === 'CONTACT' ? input.contactName?.trim() || null : null;

  let conv = await db.conversation.findFirst({
    where: { phoneHash },
    select: { id: true, lastMessageAt: true, classifiedAt: true, status: true, contactName: true },
  });
  if (!conv) {
    try {
      conv = await db.conversation.create({
        data: { tenantId, phoneHash, phoneEncrypted: seal(key), contactName: name, lastMessageAt: input.at },
        select: { id: true, lastMessageAt: true, classifiedAt: true, status: true, contactName: true },
      });
    } catch {
      // Duas mensagens do mesmo número novo ao mesmo tempo: a outra criou.
      conv = await db.conversation.findFirst({
        where: { phoneHash },
        select: { id: true, lastMessageAt: true, classifiedAt: true, status: true, contactName: true },
      });
      if (!conv) throw new Error('conversa não criada');
    }
  }

  const { count } = await db.chatMessage.createMany({
    data: [
      {
        tenantId,
        conversationId: conv.id,
        direction: input.direction,
        origin: input.origin,
        kind: input.kind,
        textEncrypted: input.text ? seal(input.text) : null,
        externalId: input.externalId,
        status: 'SENT',
        at: input.at,
        mediaRef: input.mediaRef ?? null,
        mimeType: input.mimeType ?? null,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) return { recorded: false, reason: 'duplicate' };
  const msg = await db.chatMessage.findFirst({ where: { externalId: input.externalId }, select: { id: true } });

  const newest = input.at.getTime() >= conv.lastMessageAt.getTime();
  const data: Record<string, unknown> = {};
  if (newest) {
    data.lastMessageAt = input.at;
    data.lastPreviewEncrypted = seal(previewText(input.kind, input.text));
  }
  if (input.origin === 'CONTACT') {
    data.lastInboundAt = input.at;
    if (newest) {
      data.unreadCount = { increment: 1 };
      data.awaitingReply = true;
    }
    if (name && name !== conv.contactName) data.contactName = name;
    if (conv.status === 'DECLINED') data.status = 'INBOX';
  } else if (newest) {
    data.unreadCount = 0;
    data.awaitingReply = false;
  }
  await db.conversation.update({ where: { id: conv.id, tenantId }, data });

  return { recorded: true, conversationId: conv.id, messageId: msg!.id, isNew: conv.classifiedAt === null };
}

const PROGRESS: Record<string, number> = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 };

/** Status do WhatsApp para uma mensagem nossa: só para frente (os eventos chegam fora de ordem). */
export function statusAdvances(current: string, next: string): boolean {
  const delivered = (PROGRESS[current] ?? 0) >= PROGRESS.DELIVERED;
  if (next === 'FAILED') return !delivered;
  return (PROGRESS[next] ?? 0) > (PROGRESS[current] ?? 0);
}

export async function applyChatStatus(
  tenantId: string,
  externalId: string,
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
  error: string | null,
): Promise<boolean> {
  const db = getTenantClient(tenantId);
  const row = await db.chatMessage.findFirst({ where: { externalId }, select: { id: true, status: true } });
  if (!row || !statusAdvances(row.status, status)) return false;
  const r = await db.chatMessage.updateMany({
    where: { id: row.id, status: row.status },
    data: { status, ...(status === 'FAILED' ? { errorMessage: error ?? 'O WhatsApp recusou a mensagem.' } : {}) },
  });
  return r.count > 0;
}
