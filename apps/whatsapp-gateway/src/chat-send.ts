/**
 * O envio das respostas escritas no CRM.
 *
 * O app grava a mensagem (PENDING, com o id do WhatsApp já escolhido) e pede o
 * envio aqui. Se o pedido se perder ou a linha estiver fora, a rotina de reenvio
 * pega a mensagem depois. Mandar sempre com o mesmo id faz uma segunda tentativa
 * não virar uma segunda mensagem.
 */
import type { Prisma } from '@prisma/client';
import { previewOf } from './chat-describe.js';
import { decrypt, encrypt, prisma } from './db.js';
import { env } from './env.js';
import { PERMANENT, REASON } from './outbox.js';
import { send } from './session-manager.js';

const MAX_ATTEMPTS = 5;
/** Resposta de conversa que chega horas depois atrapalha mais do que ajuda. */
const GIVE_UP_AFTER_MS = 60 * 60_000;
const BACKOFF_MS = [30_000, 2 * 60_000, 5 * 60_000, 15 * 60_000];
const OFFLINE_RETRY_MS = 2 * 60_000;
/** Tempo de reserva: acima do pior caso de um primeiro envio (45s). */
const CLAIM_MS = 90_000;

/** O que o CRM manda: a equipe, as transmissões e o robô. */
const SENDABLE = ['CRM', 'BROADCAST', 'BOT'] as const;

/** Clínica na API oficial: quem envia é o app, não o gateway. */
const NOT_CLOUD: Prisma.TenantWhereInput = {
  OR: [{ whatsappCloudAccount: { is: null } }, { whatsappCloudAccount: { is: { active: false } } }],
};
/** A rotina só olha clínicas com a linha de QR. */
const ON_GATEWAY: Prisma.TenantWhereInput = { whatsappSession: { isNot: null }, ...NOT_CLOUD };

export type ChatSendResult = { ok: true } | { ok: false; error: string };

async function fail(id: string, errorMessage: string): Promise<void> {
  await prisma.chatMessage
    .update({ where: { id }, data: { status: 'FAILED', nextAttemptAt: null, claimedUntil: null, errorMessage } })
    .catch(() => undefined);
}

export async function sendChat(tenantId: string, chatMessageId: string, now: Date = new Date()): Promise<ChatSendResult> {
  // Reserva: o pedido do app e a rotina de reenvio podem chegar juntos.
  const claim = await prisma.chatMessage.updateMany({
    where: {
      id: chatMessageId,
      tenantId,
      direction: 'OUTBOUND',
      origin: { in: [...SENDABLE] },
      status: 'PENDING',
      acceptedAt: null,
      tenant: NOT_CLOUD,
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    data: { claimedUntil: new Date(now.getTime() + CLAIM_MS) },
  });
  if (claim.count === 0) return { ok: false, error: 'not-pending' };

  const row = await prisma.chatMessage.findUnique({
    where: { id: chatMessageId },
    select: {
      id: true,
      externalId: true,
      textEncrypted: true,
      attempts: true,
      at: true,
      buttons: true,
      conversation: { select: { id: true, phoneEncrypted: true } },
    },
  });
  if (!row) return { ok: false, error: 'not-found' };

  // Contado da hora marcada: transmissão espaçada sai depois de criada.
  if (now.getTime() - row.at.getTime() > GIVE_UP_AFTER_MS) {
    await fail(row.id, 'Não foi enviada a tempo. Tente de novo.');
    return { ok: false, error: 'expired' };
  }

  let text: string;
  let phone: string;
  try {
    text = row.textEncrypted ? decrypt(row.textEncrypted, env.ENCRYPTION_MASTER_KEY, tenantId) : '';
    phone = decrypt(row.conversation.phoneEncrypted, env.ENCRYPTION_MASTER_KEY, tenantId);
  } catch {
    await fail(row.id, 'Mensagem ilegível.');
    return { ok: false, error: 'unreadable' };
  }

  // Opções do robô: até 3 viram botões (o texto já traz as opções numeradas,
  // então funciona mesmo onde os botões não aparecem).
  const options = Array.isArray(row.buttons) ? (row.buttons as { id: string; title: string }[]) : [];
  const buttons = options.length > 0 && options.length <= 3 ? options : undefined;
  const result = await send(tenantId, phone, { text, messageId: row.externalId, origin: 'CRM', buttons });

  if (result.success) {
    const acceptedAt = new Date();
    await prisma.chatMessage.update({
      where: { id: row.id },
      data: { acceptedAt, attempts: row.attempts + 1, claimedUntil: null, nextAttemptAt: null, errorMessage: null },
    });
    // Transmissão e robô: a conversa mostra a mensagem quando ela sai.
    await prisma.conversation
      .updateMany({
        where: { id: row.conversation.id, lastMessageAt: { lte: acceptedAt } },
        data: {
          lastMessageAt: acceptedAt,
          lastPreviewEncrypted: encrypt(previewOf({ kind: 'TEXT', text }), env.ENCRYPTION_MASTER_KEY, tenantId),
        },
      })
      .catch(() => undefined);
    return { ok: true };
  }

  const code = result.error ?? 'send-failed';
  if (code === 'not-connected') {
    // A linha fora do ar não é culpa da mensagem: não gasta tentativa.
    await prisma.chatMessage.update({
      where: { id: row.id },
      data: { claimedUntil: null, nextAttemptAt: new Date(now.getTime() + OFFLINE_RETRY_MS) },
    });
    return { ok: false, error: code };
  }
  if (PERMANENT.has(code)) {
    await fail(row.id, REASON[code] ?? code);
    return { ok: false, error: code };
  }

  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await fail(row.id, 'Não foi possível enviar. Tente de novo.');
    return { ok: false, error: code };
  }
  await prisma.chatMessage.update({
    where: { id: row.id },
    data: {
      attempts,
      claimedUntil: null,
      nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]),
    },
  });
  return { ok: false, error: code };
}

let running = false;

/** As respostas do CRM que ainda não saíram e já podem tentar de novo. */
export async function retryPendingChats(now: Date = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const due = await prisma.chatMessage.findMany({
      where: {
        direction: 'OUTBOUND',
        origin: { in: [...SENDABLE] },
        status: 'PENDING',
        acceptedAt: null,
        attempts: { lt: MAX_ATTEMPTS },
        tenant: ON_GATEWAY,
        AND: [
          { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          { OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }] },
        ],
        // O pedido direto do app tem alguns segundos de vantagem.
        at: { lt: new Date(now.getTime() - 15_000) },
      },
      select: { id: true, tenantId: true },
      orderBy: { at: 'asc' },
      take: 50,
    });
    let sent = 0;
    for (const m of due) if ((await sendChat(m.tenantId, m.id)).ok) sent += 1;
    if (sent > 0) console.log(`[gateway] ${sent} resposta(s) do CRM reenviada(s)`);
    return sent;
  } finally {
    running = false;
  }
}

/**
 * Aceita pelo WhatsApp e sem nenhum ack em 10 minutos: não dá para dizer que
 * chegou. Melhor a tela mostrar "não confirmada" do que um relógio eterno.
 */
export async function sweepStuckChats(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.chatMessage.updateMany({
    where: {
      direction: 'OUTBOUND',
      origin: { in: [...SENDABLE] },
      status: 'PENDING',
      acceptedAt: { lt: new Date(now.getTime() - 10 * 60_000) },
      tenant: ON_GATEWAY,
    },
    data: { status: 'FAILED', errorMessage: 'Sem confirmação do WhatsApp. Confira no celular.' },
  });
  return count;
}
