import { prisma, decrypt, type AppointmentStatus } from '@clinicaiq/db';
import {
  getWhatsAppProvider,
  getGatewayProvider,
  WHATSAPP_TEMPLATES,
  CONFIRMATION_BUTTONS,
  buildAppointmentCreatedBody,
  buildAppointmentConfirmationBody,
  buildQuoteSentBody,
  buildBirthdayBody,
  renderBirthdayTemplate,
  appointmentTemplateParams,
  quoteTemplateParams,
  type SendMessageParams,
  type SendMessageResult,
  type AppointmentMessageData,
  type WhatsAppProvider,
} from '@clinicaiq/whatsapp';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { normalizeBrazilPhone } from './phone';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getMasterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

function safeDecrypt(ciphertext: string | null | undefined, tenantId: string): string | null {
  if (!ciphertext) return null;
  try {
    return decrypt(ciphertext, getMasterKey(), tenantId);
  } catch {
    return null;
  }
}

export { normalizeBrazilPhone };

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** Meta only accepts business-initiated messages via pre-approved templates.
 *  While templates aren't approved yet (or when testing inside a 24h session
 *  window), keep this off to send the formatted body as plain text instead. */
function templatesEnabled(): boolean {
  return process.env.WHATSAPP_USE_TEMPLATES === 'true';
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * How long the outbox leaves the app's own inline attempt alone. Comfortably
 * above the gateway client's 45s timeout, so the gateway's retry loop can never
 * race a send that is still in flight and message a patient twice.
 */
const INLINE_GRACE_MS = 2 * 60 * 1000;

/**
 * Failures no retry would change. Everything else stays PENDING and belongs to
 * the gateway's outbox — a disconnected line or a slow gateway is a reason to
 * wait, not a reason the patient should never hear from the clinic.
 */
const PERMANENT_ERRORS = new Set([
  'numero-sem-whatsapp',
  'patient-without-phone',
  'invalid-number',
  'empty-body',
  'automation-disabled',
]);

/** Turns internal send-failure codes into something the clinic can act on. */
function friendlyError(code: string): string {
  const map: Record<string, string> = {
    'numero-sem-whatsapp':
      'WhatsApp não encontrado neste número — confira o cadastro (DDD + 9 dígitos, ex: 11 99999-9999)',
    'lookup-failed': 'Não foi possível verificar o número agora — reenviando automaticamente',
    'patient-without-phone': 'Paciente sem telefone cadastrado',
    'not-connected': 'WhatsApp da clínica desconectado — será enviada quando reconectar',
    'automation-disabled': 'Envio desligado nas configurações',
    'invalid-number': 'Número de telefone inválido',
    'gateway-unreachable': 'Serviço de WhatsApp fora do ar — reenviando automaticamente',
    'gateway-timeout': 'O WhatsApp demorou para responder — reenviando automaticamente',
    'empty-body': 'Mensagem vazia',
  };
  if (map[code]) return map[code];
  if (code.startsWith('gateway-http-')) {
    return 'Serviço de WhatsApp respondeu com erro — reenviando automaticamente';
  }
  return code;
}

// ─── Provider routing ────────────────────────────────────────────────────────

export type WhatsAppAutomation = 'onCreate' | 'reminder' | 'birthday';

interface ResolvedProvider {
  provider: WhatsAppProvider;
  /** True when the clinic's own paired line is sending (plain text, no templates). */
  ownLine: boolean;
}

/**
 * Picks who sends for this clinic. A clinic that paired its own number over the
 * QR code always wins — that's the number patients recognise. Otherwise we fall
 * back to the shared provider from the environment (Meta Cloud API, or the mock
 * in dev).
 *
 * Returns null when the requested automation is switched off for the clinic, so
 * callers skip the send entirely instead of logging a failure.
 */
type ProviderOutcome =
  | { kind: 'send'; resolved: ResolvedProvider }
  | { kind: 'skip'; error: string };

async function resolveProvider(
  tenantId: string,
  automation: WhatsAppAutomation,
): Promise<ProviderOutcome> {
  const session = await prisma.whatsAppSession.findUnique({
    where: { tenantId },
    select: {
      status: true,
      notifyOnCreate: true,
      notifyReminder: true,
      notifyBirthday: true,
    },
  });

  const enabled =
    automation === 'onCreate'
      ? (session?.notifyOnCreate ?? true)
      : automation === 'reminder'
        ? (session?.notifyReminder ?? true)
        : (session?.notifyBirthday ?? false);
  if (!enabled) return { kind: 'skip', error: 'automation-disabled' };

  // A clinic that paired its own number is committed to that number: patients
  // recognise it, and replies come back through it. If it's down we surface a
  // clear failure instead of quietly routing through a different sender — a
  // message from an unknown number is worse than no message, and the shared
  // provider's credentials may not even be valid.
  if (session) {
    if (session.status !== 'CONNECTED') return { kind: 'skip', error: 'not-connected' };
    const gateway = getGatewayProvider(tenantId);
    if (!gateway) return { kind: 'skip', error: 'gateway-unreachable' };
    return { kind: 'send', resolved: { provider: gateway, ownLine: true } };
  }

  // Birthday greetings are marketing, not transactional — Meta would reject them
  // without an approved template, so they only ride the clinic's own line.
  if (automation === 'birthday') return { kind: 'skip', error: 'not-connected' };

  // No line ever paired: fall back to the environment provider (Meta / mock).
  return { kind: 'send', resolved: { provider: getWhatsAppProvider(), ownLine: false } };
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface WhatsAppHealth {
  /** The clinic has paired a number at some point (uses the own-line path). */
  paired: boolean;
  /** Safe to send right now. */
  connected: boolean;
  /** Short, actionable sentence when something is wrong. */
  problem: string | null;
}

/** The gateway beats every 30s; three minutes of silence means it's not running. */
const HEARTBEAT_STALE_MS = 3 * 60 * 1000;

/**
 * Whether this clinic's WhatsApp can actually deliver right now. The session row
 * alone isn't trustworthy: if the gateway dies without a clean socket close, the
 * status stays CONNECTED forever. Cross-checking the gateway's heartbeat catches
 * that, so the UI can warn instead of quietly dropping messages.
 */
export async function getWhatsAppHealth(tenantId: string): Promise<WhatsAppHealth> {
  const [session, heartbeat] = await Promise.all([
    prisma.whatsAppSession.findUnique({
      where: { tenantId },
      select: { status: true, lastError: true },
    }),
    prisma.gatewayHeartbeat.findUnique({
      where: { id: 'gateway' },
      select: { beatAt: true },
    }),
  ]);

  if (!session) return { paired: false, connected: false, problem: null };

  if (session.status !== 'CONNECTED') {
    return {
      paired: true,
      connected: false,
      problem:
        session.lastError ??
        'O WhatsApp da clínica está desconectado — as confirmações não estão sendo enviadas.',
    };
  }

  const stale = !heartbeat || Date.now() - heartbeat.beatAt.getTime() > HEARTBEAT_STALE_MS;
  if (stale) {
    return {
      paired: true,
      connected: false,
      problem: 'O serviço de WhatsApp não está respondendo. As confirmações estão pausadas.',
    };
  }

  return { paired: true, connected: true, problem: null };
}

interface OutboxEntry {
  tenantId: string;
  patientId: string;
  appointmentId?: string;
  quoteId?: string;
  templateName: string;
  content: string;
}

/**
 * Logs a message that was never attempted, so the clinic can see *why* in the
 * history instead of wondering why a patient got nothing.
 *
 * A skip isn't always final: "the line is down right now" is a reason to queue,
 * not to give up, so those land PENDING and the gateway's outbox sends them once
 * the socket is back. Deliberately silent for `automation-disabled` — that's the
 * clinic's own setting, not a fault.
 */
async function recordSkip(error: string, entry: OutboxEntry): Promise<void> {
  if (error === 'automation-disabled') return;
  const retryable = !PERMANENT_ERRORS.has(error);
  await prisma.whatsAppMessage
    .create({
      data: {
        tenantId: entry.tenantId,
        patientId: entry.patientId,
        appointmentId: entry.appointmentId ?? null,
        quoteId: entry.quoteId ?? null,
        direction: 'OUTBOUND',
        templateName: entry.templateName,
        content: entry.content,
        status: retryable ? 'PENDING' : 'FAILED',
        nextAttemptAt: retryable ? new Date() : null,
        errorMessage: friendlyError(error),
      },
    })
    .catch(() => undefined);
}

/**
 * Opens an outbox row before anything is attempted.
 *
 * Written first on purpose. The send runs inside `after()`, where a timeout or a
 * function killed mid-flight used to leave no trace at all — the patient got
 * nothing and the clinic had nothing on screen to tell them so. With the row
 * already in place, the worst case is a retry instead of a silent loss.
 */
async function openOutboxRow(entry: OutboxEntry): Promise<string | null> {
  const row = await prisma.whatsAppMessage
    .create({
      data: {
        tenantId: entry.tenantId,
        patientId: entry.patientId,
        appointmentId: entry.appointmentId ?? null,
        quoteId: entry.quoteId ?? null,
        direction: 'OUTBOUND',
        templateName: entry.templateName,
        content: entry.content,
        status: 'PENDING',
        // This call is attempt one; the grace keeps the gateway's retry loop off
        // the row while it is still in flight.
        attempts: 1,
        lastAttemptAt: new Date(),
        nextAttemptAt: new Date(Date.now() + INLINE_GRACE_MS),
      },
      select: { id: true },
    })
    .catch(() => null);
  return row?.id ?? null;
}

/**
 * Records how the inline attempt went.
 *
 * On the clinic's own line, success only means the socket accepted it — the
 * gateway has already stamped the row with WhatsApp's id and the real acks
 * decide the rest, so there is nothing to settle here. Meta answers about
 * acceptance synchronously, so SENT is honest on that path.
 *
 * Every write is guarded by `externalId: null`: if the gateway stamped the row
 * while our HTTP call was timing out, that message is on its way and must not be
 * overwritten with our stale idea of a failure.
 */
async function closeAttempt(
  messageId: string,
  result: SendMessageResult,
  ownLine: boolean,
): Promise<void> {
  if (result.success) {
    if (ownLine) return; // gateway stamped it; the acks take over from here
    await prisma.whatsAppMessage
      .updateMany({
        where: { id: messageId, externalId: null },
        data: {
          status: 'SENT',
          externalId: result.messageId ?? null,
          sentAt: new Date(),
          nextAttemptAt: null,
          errorMessage: null,
        },
      })
      .catch(() => undefined);
    return;
  }

  const code = result.error ?? 'send-failed';
  // Only the clinic's own line has an outbox behind it — the gateway's retry
  // loop sends through its own sockets. A Meta-routed failure has nobody to pick
  // it up, so leaving it PENDING would be "Saindo…" forever.
  const retryable = ownLine && !PERMANENT_ERRORS.has(code);
  await prisma.whatsAppMessage
    .updateMany({
      where: { id: messageId, externalId: null },
      data: {
        // Left PENDING while a retry could still work: the outbox owns it now,
        // and calling it FAILED here would stop the one thing that can deliver.
        status: retryable ? 'PENDING' : 'FAILED',
        nextAttemptAt: retryable ? new Date(Date.now() + INLINE_GRACE_MS) : null,
        errorMessage: friendlyError(code),
      },
    })
    .catch(() => undefined);
}

// ─── Outbound: appointments ──────────────────────────────────────────────────

/** A send that has been recorded and is ready to hand to its provider. */
export interface PreparedSend {
  rowId: string;
  provider: WhatsAppProvider;
  ownLine: boolean;
  params: SendMessageParams;
}

/**
 * Either something left to send, or an outcome already settled — the automation
 * is off, the patient has no phone, the row was queued for the outbox.
 */
export type Preparation =
  | { kind: 'send'; send: PreparedSend }
  | { kind: 'done'; result: SendMessageResult };

/**
 * Records the "created" or "reminder" message and works out how to send it,
 * without sending anything yet.
 *
 * Split from the send so a caller can do this part *synchronously*, while it
 * still controls the request. `after()` is an optimisation, not a guarantee: if
 * the platform never runs the callback, a booking prepared here is still in the
 * outbox and the gateway delivers it a couple of minutes later. Prepared inside
 * `after()`, that same booking left no trace at all.
 */
export async function prepareAppointmentMessage(
  appointmentId: string,
  kind: 'created' | 'reminder',
): Promise<Preparation> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      tenantId: true,
      startTime: true,
      patient: { select: { id: true, name: true, phoneEncrypted: true } },
      professional: { select: { name: true } },
      procedure: { select: { name: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!appt) return { kind: 'done', result: { success: false, error: 'appointment-not-found' } };

  const phone = safeDecrypt(appt.patient.phoneEncrypted, appt.tenantId);
  if (!phone) return { kind: 'done', result: { success: false, error: 'patient-without-phone' } };

  const data: AppointmentMessageData = {
    patientName: appt.patient.name,
    clinicName: appt.tenant.name,
    professionalName: appt.professional.name,
    procedureName: appt.procedure?.name ?? null,
    dateLabel: format(appt.startTime, "EEEE, dd/MM", { locale: ptBR }),
    timeLabel: format(appt.startTime, 'HH:mm'),
  };

  const isReminder = kind === 'reminder';
  const templateName = isReminder
    ? WHATSAPP_TEMPLATES.appointmentConfirmation
    : WHATSAPP_TEMPLATES.appointmentCreated;
  const body = isReminder
    ? buildAppointmentConfirmationBody(data)
    : buildAppointmentCreatedBody(data);

  const outcome = await resolveProvider(appt.tenantId, isReminder ? 'reminder' : 'onCreate');
  if (outcome.kind === 'skip') {
    await recordSkip(outcome.error, {
      tenantId: appt.tenantId,
      patientId: appt.patient.id,
      appointmentId: appt.id,
      templateName,
      content: body,
    });
    return { kind: 'done', result: { success: false, error: outcome.error } };
  }
  const resolved = outcome.resolved;

  // The row exists before the send does — see openOutboxRow.
  const rowId = await openOutboxRow({
    tenantId: appt.tenantId,
    patientId: appt.patient.id,
    appointmentId: appt.id,
    templateName,
    content: body,
  });
  if (!rowId) return { kind: 'done', result: { success: false, error: 'outbox-write-failed' } };

  return {
    kind: 'send',
    send: {
      rowId,
      provider: resolved.provider,
      ownLine: resolved.ownLine,
      params: {
        to: normalizeBrazilPhone(phone),
        body,
        ref: rowId,
        // On the clinic's own line (QR) we send plain text: WhatsApp doesn't
        // reliably render tappable buttons on that path, and the body already
        // carries the "responda 1 ou 2" prompt — which works on every device and
        // keeps the number looking like a normal person, not an automation. On
        // Meta with approved templates we send the structured template + its
        // {{1}}..{{5}} params (business-initiated, no 24h window). The
        // webhook/inbound route understands typed "1"/"2"/"confirmar" either way.
        ...(resolved.ownLine
          ? {}
          : templatesEnabled()
            ? { templateName, templateParams: appointmentTemplateParams(data) }
            : { buttons: CONFIRMATION_BUTTONS.map((b) => ({ ...b })) }),
      },
    },
  };
}

/**
 * Hands a prepared send to its provider and settles the outbox row. Never
 * throws — a failure here leaves the row for the gateway's outbox to retry.
 */
export async function deliverPrepared(send: PreparedSend): Promise<SendMessageResult> {
  const result = await send.provider.sendMessage(send.params);
  await closeAttempt(send.rowId, result, send.ownLine);
  return result;
}

/**
 * Prepare and send in one go, for callers already running in the background —
 * the reminder cron and the BullMQ worker, where there is no response to race.
 */
export async function dispatchAppointmentMessage(
  appointmentId: string,
  kind: 'created' | 'reminder',
): Promise<SendMessageResult> {
  const prepared = await prepareAppointmentMessage(appointmentId, kind);
  return prepared.kind === 'done' ? prepared.result : deliverPrepared(prepared.send);
}

// ─── Outbound: quotes ────────────────────────────────────────────────────────

export async function dispatchQuoteMessage(quoteId: string): Promise<SendMessageResult> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      tenantId: true,
      publicToken: true,
      total: true,
      validUntil: true,
      patient: { select: { id: true, name: true, phoneEncrypted: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!quote) return { success: false, error: 'quote-not-found' };

  const phone = safeDecrypt(quote.patient.phoneEncrypted, quote.tenantId);
  if (!phone) return { success: false, error: 'patient-without-phone' };

  const quoteData = {
    patientName: quote.patient.name,
    clinicName: quote.tenant.name,
    totalLabel: formatBRL(Number(quote.total)),
    validUntilLabel: format(quote.validUntil, 'dd/MM/yyyy'),
    link: `${appUrl()}/orcamento/${quote.publicToken}`,
  };
  const body = buildQuoteSentBody(quoteData);

  // A quote is a direct reply to something the patient asked for, so it follows
  // the same routing as the "created" notification.
  const outcome = await resolveProvider(quote.tenantId, 'onCreate');
  if (outcome.kind === 'skip') {
    await recordSkip(outcome.error, {
      tenantId: quote.tenantId,
      patientId: quote.patient.id,
      quoteId: quote.id,
      templateName: WHATSAPP_TEMPLATES.quoteSent,
      content: body,
    });
    return { success: false, error: outcome.error };
  }
  const resolved = outcome.resolved;

  const rowId = await openOutboxRow({
    tenantId: quote.tenantId,
    patientId: quote.patient.id,
    quoteId: quote.id,
    templateName: WHATSAPP_TEMPLATES.quoteSent,
    content: body,
  });
  if (!rowId) return { success: false, error: 'outbox-write-failed' };

  const result = await resolved.provider.sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
    ref: rowId,
    ...(!resolved.ownLine && templatesEnabled()
      ? { templateName: WHATSAPP_TEMPLATES.quoteSent, templateParams: quoteTemplateParams(quoteData) }
      : {}),
  });

  await closeAttempt(rowId, result, resolved.ownLine);
  return result;
}

// ─── Outbound: birthdays ─────────────────────────────────────────────────────

/**
 * Sends a birthday greeting from the clinic's own line. Skipped silently when
 * the clinic hasn't enabled it, hasn't paired a number, or the patient already
 * got one today (the cron may run more than once).
 */
export async function dispatchBirthdayMessage(patientId: string): Promise<SendMessageResult> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      phoneEncrypted: true,
      active: true,
      deletedAt: true,
      tenant: { select: { name: true } },
    },
  });
  if (!patient || !patient.active || patient.deletedAt) {
    return { success: false, error: 'patient-unavailable' };
  }

  const session = await prisma.whatsAppSession.findUnique({
    where: { tenantId: patient.tenantId },
    select: { birthdayMessage: true },
  });

  const outcome = await resolveProvider(patient.tenantId, 'birthday');
  if (outcome.kind === 'skip') return { success: false, error: outcome.error };
  const resolved = outcome.resolved;

  const phone = safeDecrypt(patient.phoneEncrypted, patient.tenantId);
  if (!phone) return { success: false, error: 'patient-without-phone' };

  const data = { patientName: patient.name, clinicName: patient.tenant.name };
  const custom = session?.birthdayMessage?.trim();
  const body = custom ? renderBirthdayTemplate(custom, data) : buildBirthdayBody(data);

  const rowId = await openOutboxRow({
    tenantId: patient.tenantId,
    patientId: patient.id,
    templateName: WHATSAPP_TEMPLATES.birthday,
    content: body,
  });
  if (!rowId) return { success: false, error: 'outbox-write-failed' };

  const result = await resolved.provider.sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
    ref: rowId,
  });

  await closeAttempt(rowId, result, resolved.ownLine);
  return result;
}

// ─── Inbound: patient responses (webhook) ────────────────────────────────────

const BUTTON_TO_STATUS: Record<string, AppointmentStatus> = {
  confirm: 'CONFIRMED',
  reschedule: 'RESCHEDULED',
  cancel: 'CANCELLED',
};

/** Maps a button id (preferred) or free text to an appointment status. The
 *  numbered replies match the "responda 1 ou 2" prompt in the message body. */
export function resolveResponseStatus(
  buttonReplyId?: string,
  text?: string,
): AppointmentStatus | null {
  if (buttonReplyId && BUTTON_TO_STATUS[buttonReplyId]) return BUTTON_TO_STATUS[buttonReplyId];
  const t = (text ?? '').trim().toLowerCase();
  if (/^1\b/.test(t) || /\bconfirm/.test(t)) return 'CONFIRMED';
  if (/^2\b/.test(t) || /remarc|reagend/.test(t)) return 'RESCHEDULED';
  // Cancel isn't offered as an option, but an explicit "cancelar" is respected.
  if (/\bcancel/.test(t)) return 'CANCELLED';
  return null;
}

/**
 * Resolves which appointment an inbound message refers to by matching the
 * sender's phone against recent confirmation messages (bounded window). Meta
 * webhooks identify the sender only by phone, and phones are encrypted at rest,
 * so we decrypt the small set of candidates rather than querying by plaintext.
 */
export async function resolveAppointmentByPhone(
  fromPhone: string,
  tenantId?: string,
): Promise<string | null> {
  const target = normalizeBrazilPhone(fromPhone);
  if (!target) return null;

  // Match against both the booking and reminder messages, since a patient may
  // reply to either. A week's window covers appointments booked well ahead.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.whatsAppMessage.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      direction: 'OUTBOUND',
      templateName: {
        in: [WHATSAPP_TEMPLATES.appointmentConfirmation, WHATSAPP_TEMPLATES.appointmentCreated],
      },
      createdAt: { gte: since },
      appointment: { status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] } },
    },
    select: {
      tenantId: true,
      appointmentId: true,
      patient: { select: { phoneEncrypted: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  for (const c of candidates) {
    if (!c.appointmentId) continue;
    const phone = safeDecrypt(c.patient.phoneEncrypted, c.tenantId);
    if (phone && normalizeBrazilPhone(phone) === target) return c.appointmentId;
  }
  return null;
}

/**
 * Applies a patient's response to an appointment: updates the status and records
 * the INBOUND message. Returns whether a change was made.
 */
export async function applyAppointmentResponse(
  appointmentId: string,
  opts: { buttonReplyId?: string; text?: string; externalId?: string },
): Promise<boolean> {
  const status = resolveResponseStatus(opts.buttonReplyId, opts.text);
  if (!status) return false;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, tenantId: true, patientId: true },
  });
  if (!appt) return false;

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status },
  });

  await prisma.whatsAppMessage.create({
    data: {
      tenantId: appt.tenantId,
      patientId: appt.patientId,
      appointmentId: appt.id,
      direction: 'INBOUND',
      content: opts.text ?? opts.buttonReplyId ?? '',
      status: 'READ',
      externalId: opts.externalId ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: appt.tenantId,
      action: `WHATSAPP_RESPONSE_${status}`,
      entity: 'Appointment',
      entityId: appt.id,
    },
  });

  return true;
}

/**
 * Marks the patient behind a phone number as opted out of campaigns. Phones are
 * encrypted at rest, so we decrypt the tenant's patients to find the match —
 * bounded by tenant, and only for patients who could actually be messaged.
 */
export async function optOutByPhone(fromPhone: string, tenantId: string): Promise<boolean> {
  const target = normalizeBrazilPhone(fromPhone);
  if (!target) return false;

  const patients = await prisma.patient.findMany({
    where: { tenantId, deletedAt: null, whatsappOptOut: false },
    select: { id: true, phoneEncrypted: true },
    take: 5000,
  });

  for (const p of patients) {
    const phone = safeDecrypt(p.phoneEncrypted, tenantId);
    if (phone && normalizeBrazilPhone(phone) === target) {
      await prisma.patient.update({ where: { id: p.id }, data: { whatsappOptOut: true } });
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'WHATSAPP_OPT_OUT',
          entity: 'Patient',
          entityId: p.id,
        },
      });
      return true;
    }
  }
  return false;
}

/** Updates delivery status (delivered/read/failed) for a message by externalId. */
export async function applyMessageStatus(
  externalId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
): Promise<void> {
  const map: Record<string, { status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; field?: 'deliveredAt' | 'readAt' }> = {
    sent: { status: 'SENT' },
    delivered: { status: 'DELIVERED', field: 'deliveredAt' },
    read: { status: 'READ', field: 'readAt' },
    failed: { status: 'FAILED' },
  };
  const m = map[status];
  if (!m) return;

  await prisma.whatsAppMessage.updateMany({
    where: { externalId },
    data: {
      status: m.status,
      ...(m.field ? { [m.field]: new Date() } : {}),
    },
  });
}
