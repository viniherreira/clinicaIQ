import { decrypt, encrypt, getTenantClient, prisma } from '@clinicaiq/db';
import { CloudApiError } from '@clinicaiq/whatsapp';
import { activeCloudAccount, cloudClient, windowOpen, type CloudAccount } from './cloud';
import { previewText } from './chat-ingest';

/**
 * Envio das mensagens do CRM pela API oficial. Mesma ideia da fila do gateway
 * (`apps/whatsapp-gateway/src/chat-send.ts`): a linha é reservada antes de
 * mandar, a falha passageira volta para a fila e a definitiva vira "não
 * enviada" com o motivo. A diferença: aqui o id é a Meta que dá.
 */

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [30_000, 2 * 60_000, 5 * 60_000, 15 * 60_000];
const GIVE_UP_AFTER_MS = 60 * 60_000;
const CLAIM_MS = 60_000;

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

const SENDABLE = ['CRM', 'BROADCAST', 'BOT'] as const;

export type CloudSendResult = { ok: true } | { ok: false; error: string };

export async function sendViaCloud(
  account: CloudAccount,
  chatMessageId: string,
  now: Date = new Date(),
): Promise<CloudSendResult> {
  const { tenantId } = account;
  const db = getTenantClient(tenantId);
  const claim = await db.chatMessage.updateMany({
    where: {
      id: chatMessageId,
      direction: 'OUTBOUND',
      origin: { in: [...SENDABLE] },
      status: 'PENDING',
      acceptedAt: null,
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    data: { claimedUntil: new Date(now.getTime() + CLAIM_MS) },
  });
  if (claim.count === 0) return { ok: false, error: 'not-pending' };

  const row = await db.chatMessage.findFirst({
    where: { id: chatMessageId },
    select: {
      id: true,
      origin: true,
      textEncrypted: true,
      templateName: true,
      templateLang: true,
      templateParams: true,
      buttons: true,
      attempts: true,
      at: true,
      conversation: { select: { id: true, phoneEncrypted: true, lastInboundAt: true, lastMessageAt: true } },
    },
  });
  if (!row) return { ok: false, error: 'not-found' };

  const fail = async (errorMessage: string) => {
    await db.chatMessage.updateMany({
      where: { id: row.id },
      data: { status: 'FAILED', claimedUntil: null, nextAttemptAt: null, errorMessage },
    });
    return { ok: false as const, error: errorMessage };
  };

  if (now.getTime() - row.at.getTime() > GIVE_UP_AFTER_MS) return fail('Não foi enviada a tempo. Tente de novo.');

  let text = '';
  let phone = '';
  try {
    text = row.textEncrypted ? decrypt(row.textEncrypted, masterKey(), tenantId) : '';
    phone = decrypt(row.conversation.phoneEncrypted, masterKey(), tenantId);
  } catch {
    return fail('Mensagem ilegível.');
  }

  if (!row.templateName && !windowOpen(row.conversation.lastInboundAt, now)) {
    return fail('Passaram 24 horas desde a última mensagem da pessoa. Use um modelo aprovado.');
  }

  const api = cloudClient(account);
  const buttons = Array.isArray(row.buttons) ? (row.buttons as { id: string; title: string }[]) : [];
  try {
    const sent = row.templateName
      ? await api.sendTemplate(phone, row.templateName, row.templateLang ?? 'pt_BR', (row.templateParams as string[] | null) ?? [])
      : buttons.length > 0 && buttons.length <= 3
        ? await api.sendButtons(phone, text, buttons)
        : buttons.length > 3
          ? await api.sendList(phone, text, 'Ver opções', buttons)
          : await api.sendText(phone, text);

    await db.chatMessage.updateMany({
      where: { id: row.id },
      data: { externalId: sent.id, acceptedAt: new Date(), attempts: row.attempts + 1, claimedUntil: null, nextAttemptAt: null, errorMessage: null },
    });
    // Transmissão e robô: a conversa mostra a mensagem quando ela sai, não quando entrou na fila.
    if (row.conversation.lastMessageAt.getTime() <= now.getTime()) {
      await db.conversation.updateMany({
        where: { id: row.conversation.id, lastMessageAt: { lte: now } },
        data: { lastMessageAt: now, lastPreviewEncrypted: encrypt(previewText('TEXT', text), masterKey(), tenantId) },
      });
    }
    return { ok: true };
  } catch (e) {
    const err =
      e instanceof CloudApiError ? e : new CloudApiError(0, undefined, 'Falha ao falar com a Meta.', true, false, String(e));
    if (err.code === 190) {
      await prisma.whatsAppCloudAccount.update({ where: { id: account.id }, data: { status: 'ERROR', lastError: err.userMessage } });
    }
    const attempts = row.attempts + 1;
    if (!err.retryable || attempts >= MAX_ATTEMPTS) return fail(err.userMessage);
    await db.chatMessage.updateMany({
      where: { id: row.id },
      data: {
        attempts,
        claimedUntil: null,
        nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]),
      },
    });
    return { ok: false, error: err.userMessage };
  }
}

/** A fila da API oficial, rodada pelo relógio do CRM. */
export async function processCloudQueue(now: Date = new Date(), limit = 100): Promise<number> {
  const due = await prisma.chatMessage.findMany({
    where: {
      direction: 'OUTBOUND',
      origin: { in: [...SENDABLE] },
      status: 'PENDING',
      acceptedAt: null,
      attempts: { lt: MAX_ATTEMPTS },
      at: { lte: new Date(now.getTime() - 10_000) },
      tenant: { whatsappCloudAccount: { is: { active: true, status: 'CONNECTED' } } },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }] },
      ],
    },
    select: { id: true, tenantId: true },
    orderBy: { at: 'asc' },
    take: limit,
  });

  const accounts = new Map<string, CloudAccount | null>();
  let sent = 0;
  for (const m of due) {
    if (!accounts.has(m.tenantId)) accounts.set(m.tenantId, await activeCloudAccount(m.tenantId));
    const account = accounts.get(m.tenantId);
    if (account && (await sendViaCloud(account, m.id, now)).ok) sent += 1;
  }
  return sent;
}
