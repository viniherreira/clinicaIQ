/**
 * The delivery safety net.
 *
 * Every outbound message is written to `whatsapp_messages` *before* anyone tries
 * to send it, and the app's inline attempt is only the first of several. If that
 * attempt dies — a timeout, a redeploy mid-flight, a socket that was reconnecting
 * at that exact second — the row is still there, still PENDING, and this module
 * picks it up. Nothing else in the system retries, so without this a booking made
 * during a sixty-second reconnect simply never reached the patient.
 */
import { decrypt, prisma } from './db.js';
import { env } from './env.js';
import { normalizeBrazilPhone } from './phone.js';
import { send } from './session-manager.js';

/** Attempts before we stop and tell the clinic to phone the patient instead. */
const MAX_ATTEMPTS = 5;

/**
 * Gap before each retry, slow on purpose: the usual cause is a line that has to
 * come back, which takes minutes rather than seconds. The last entry repeats if
 * attempts remain.
 */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 45 * 60_000];

/**
 * A disconnected line is not this message's fault, so waiting for it doesn't
 * spend one of the message's attempts — otherwise a clinic that unpairs over the
 * weekend comes back to a queue that already gave up.
 */
const OFFLINE_RETRY_MS = 2 * 60_000;

/**
 * An appointment notice that lands a day late is worse than one that never
 * lands, so the outbox stops eventually however many attempts are left.
 */
const GIVE_UP_AFTER_MS = 6 * 60 * 60 * 1000;

/** Rows per pass, so one clinic's backlog can't starve the others. */
const BATCH = 50;

/** Failures no retry would change. Everything else is worth another go. */
const PERMANENT = new Set(['numero-sem-whatsapp', 'invalid-number', 'empty-body']);

/**
 * Reasons the clinic will read on the message. Mirrors friendlyError in
 * apps/web/lib/whatsapp.ts — same codes, same wording. Change them together.
 */
const REASON: Record<string, string> = {
  'numero-sem-whatsapp':
    'WhatsApp não encontrado neste número — confira o cadastro (DDD + 9 dígitos, ex: 11 99999-9999)',
  'invalid-number': 'Número de telefone inválido',
  'empty-body': 'Mensagem vazia',
};

async function settle(id: string, errorMessage: string): Promise<void> {
  await prisma.whatsAppMessage
    .update({
      where: { id },
      data: {
        status: 'FAILED',
        nextAttemptAt: null,
        lastAttemptAt: new Date(),
        errorMessage,
      },
    })
    .catch(() => undefined);
}

async function reschedule(id: string, attempts: number, delayMs: number): Promise<void> {
  await prisma.whatsAppMessage
    .update({
      where: { id },
      data: {
        attempts,
        lastAttemptAt: new Date(),
        nextAttemptAt: new Date(Date.now() + delayMs),
      },
    })
    .catch(() => undefined);
}

/**
 * Guards against overlapping passes. A batch is sent one message at a time and
 * can easily outlive the interval that started it; without this, the next tick
 * would re-read the same rows — still PENDING, still unstamped — and send every
 * one of them a second time.
 */
let running = false;

/**
 * Sends every message that is due for another attempt. Returns how many made it
 * onto the socket this pass.
 */
export async function retryPendingMessages(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    return await runPass();
  } finally {
    running = false;
  }
}

async function runPass(): Promise<number> {
  const now = new Date();
  const due = await prisma.whatsAppMessage.findMany({
    where: {
      direction: 'OUTBOUND',
      status: 'PENDING',
      // Only clinics on their own line: this loop sends through the gateway's
      // sockets, so it has nothing to offer a Meta-routed message and would just
      // spin on "not-connected" until the row aged out.
      tenant: { whatsappSession: { isNot: null } },
      // No externalId means WhatsApp never took it. A row that has one was
      // accepted by the socket and belongs to the ack path — this single
      // condition is what stops a lost HTTP reply becoming a second message to
      // the patient, because the gateway stamps the id before it answers.
      externalId: null,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    select: {
      id: true,
      tenantId: true,
      content: true,
      attempts: true,
      createdAt: true,
      patient: { select: { phoneEncrypted: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });

  let delivered = 0;
  for (const msg of due) {
    if (Date.now() - msg.createdAt.getTime() > GIVE_UP_AFTER_MS) {
      await settle(msg.id, 'Não foi possível enviar a tempo — ligue para o paciente.');
      continue;
    }

    let phone: string;
    try {
      phone = normalizeBrazilPhone(
        decrypt(msg.patient.phoneEncrypted, env.ENCRYPTION_MASTER_KEY, msg.tenantId),
      );
    } catch {
      await settle(msg.id, 'Telefone do paciente ilegível — confira o cadastro.');
      continue;
    }
    if (!phone) {
      await settle(msg.id, 'Paciente sem telefone cadastrado');
      continue;
    }

    // Buttons are deliberately dropped on a retry: they are unofficial on this
    // transport and the body already carries the "responda 1 ou 2" fallback, so
    // plain text is the form most likely to actually arrive.
    const result = await send(msg.tenantId, phone, { text: msg.content, ref: msg.id });

    if (result.success) {
      // send() stamped externalId through `ref`, so this row is settled.
      delivered += 1;
      continue;
    }

    if (result.error === 'not-connected') {
      await reschedule(msg.id, msg.attempts, OFFLINE_RETRY_MS);
      continue;
    }

    const code = result.error ?? 'send-failed';
    if (PERMANENT.has(code)) {
      await settle(msg.id, REASON[code] ?? code);
      continue;
    }

    const attempts = msg.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await settle(
        msg.id,
        'Não foi possível entregar após várias tentativas — ligue para o paciente.',
      );
      continue;
    }
    await reschedule(msg.id, attempts, BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]);
  }

  if (delivered > 0) console.log(`[gateway] outbox reenviou ${delivered} mensagem(ns)`);
  return delivered;
}

/**
 * How long a message may sit without WhatsApp confirming delivery before we stop
 * calling it "on its way". Generous: a phone that is off or out of signal
 * legitimately takes minutes.
 */
const STUCK_AFTER_MS = 10 * 60 * 1000;

/**
 * Closes out messages WhatsApp took but never confirmed.
 *
 * `messages.update` only fires on the socket that sent the message, so a restart
 * or a dropped connection between send and ack loses it — the row keeps saying
 * "Saindo…" for a message that reached nobody. That is the worst failure mode
 * for a clinic: it looks like the patient was warned when they were not, so
 * nobody calls. Undelivered is the honest reading.
 */
export async function sweepStuckMessages(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
  const { count } = await prisma.whatsAppMessage.updateMany({
    where: {
      direction: 'OUTBOUND',
      status: { in: ['PENDING', 'SENT'] },
      // Only rows the socket actually accepted. One without an externalId was
      // never handed over and still has retries coming; failing it here would
      // cancel a delivery that hasn't really been attempted yet.
      externalId: { not: null },
      // Only clinics on their own line. Their acks come through this gateway, so
      // silence here is evidence. A Meta-routed message reports through the app's
      // webhook instead, and judging it by our acks would fail every one of them.
      tenant: { whatsappSession: { isNot: null } },
      createdAt: { lt: cutoff },
      deliveredAt: null,
      readAt: null,
    },
    data: {
      status: 'FAILED',
      nextAttemptAt: null,
      errorMessage: 'Sem confirmação de entrega do WhatsApp — trate como não recebida.',
    },
  });
  if (count > 0) console.log(`[gateway] ${count} mensagem(ns) sem ack marcada(s) como nao entregue`);
  return count;
}
