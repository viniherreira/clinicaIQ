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
  type SendMessageResult,
  type AppointmentMessageData,
  type WhatsAppProvider,
} from '@clinicaiq/whatsapp';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

/** Brazilian numbers need the country code for the Meta API. Strips the mask
 *  and prefixes 55 when the operator/country code is absent. */
export function normalizeBrazilPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

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
 * Status to record right after handing a message off. On the clinic's own line
 * the gateway only gets a locally generated id back — WhatsApp hasn't seen the
 * message yet — so claiming SENT there is a lie that hides non-delivery. Leave
 * it PENDING and let the real ack promote it. The Meta path reports acceptance
 * synchronously, so SENT is honest there.
 */
function initialStatus(ownLine: boolean): 'PENDING' | 'SENT' {
  return ownLine ? 'PENDING' : 'SENT';
}

/** Turns internal send-failure codes into something the clinic can act on. */
function friendlyError(code: string): string {
  const map: Record<string, string> = {
    'numero-sem-whatsapp':
      'WhatsApp não encontrado neste número — confira o cadastro (DDD + 9 dígitos, ex: 11 99999-9999)',
    'lookup-failed': 'Não foi possível verificar o número agora — tente reenviar',
    'patient-without-phone': 'Paciente sem telefone cadastrado',
    'not-connected': 'WhatsApp da clínica desconectado',
    'automation-disabled': 'Envio desligado nas configurações',
    'invalid-number': 'Número de telefone inválido',
    'gateway-unreachable': 'Serviço de WhatsApp fora do ar no momento',
    'empty-body': 'Mensagem vazia',
  };
  return map[code] ?? code;
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

/**
 * Logs a message that was never attempted, so the clinic can see *why* in the
 * history instead of wondering why a patient got nothing. Deliberately silent
 * for `automation-disabled`: that's the clinic's own setting, not a fault.
 */
async function recordSkip(
  error: string,
  entry: {
    tenantId: string;
    patientId: string;
    appointmentId?: string;
    quoteId?: string;
    templateName: string;
    content: string;
  },
): Promise<void> {
  if (error === 'automation-disabled') return;
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
        status: 'FAILED',
        errorMessage: friendlyError(error),
      },
    })
    .catch(() => undefined);
}

// ─── Outbound: appointments ──────────────────────────────────────────────────

/**
 * Sends the "created" or "reminder/confirmation" message for an appointment and
 * records the attempt as an OUTBOUND WhatsAppMessage (SENT or FAILED). Never
 * throws — returns the provider result so callers can fire-and-forget.
 */
export async function dispatchAppointmentMessage(
  appointmentId: string,
  kind: 'created' | 'reminder',
): Promise<SendMessageResult> {
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
  if (!appt) return { success: false, error: 'appointment-not-found' };

  const phone = safeDecrypt(appt.patient.phoneEncrypted, appt.tenantId);
  if (!phone) return { success: false, error: 'patient-without-phone' };

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
    return { success: false, error: outcome.error };
  }
  const resolved = outcome.resolved;

  const result = await resolved.provider.sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
    // On the clinic's own line (QR) we send plain text: WhatsApp doesn't reliably
    // render tappable buttons on that path, and the body already carries the
    // "responda 1 ou 2" prompt — which works on every device and keeps the number
    // looking like a normal person, not an automation. On Meta with approved
    // templates we send the structured template + its {{1}}..{{5}} params
    // (business-initiated, no 24h window). The webhook/inbound route understands
    // typed "1"/"2"/"confirmar" either way.
    ...(resolved.ownLine
      ? {}
      : templatesEnabled()
        ? { templateName, templateParams: appointmentTemplateParams(data) }
        : { buttons: CONFIRMATION_BUTTONS.map((b) => ({ ...b })) }),
  });

  await prisma.whatsAppMessage.create({
    data: {
      tenantId: appt.tenantId,
      patientId: appt.patient.id,
      appointmentId: appt.id,
      direction: 'OUTBOUND',
      templateName,
      content: body,
      status: result.success ? initialStatus(resolved.ownLine) : 'FAILED',
      externalId: result.messageId ?? null,
      sentAt: result.success && !resolved.ownLine ? new Date() : null,
      errorMessage: result.success ? null : friendlyError(result.error ?? 'send-failed'),
    },
  });

  return result;
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

  const result = await resolved.provider.sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
    ...(!resolved.ownLine && templatesEnabled()
      ? { templateName: WHATSAPP_TEMPLATES.quoteSent, templateParams: quoteTemplateParams(quoteData) }
      : {}),
  });

  await prisma.whatsAppMessage.create({
    data: {
      tenantId: quote.tenantId,
      patientId: quote.patient.id,
      quoteId: quote.id,
      direction: 'OUTBOUND',
      templateName: WHATSAPP_TEMPLATES.quoteSent,
      content: body,
      status: result.success ? initialStatus(resolved.ownLine) : 'FAILED',
      externalId: result.messageId ?? null,
      sentAt: result.success && !resolved.ownLine ? new Date() : null,
      errorMessage: result.success ? null : friendlyError(result.error ?? 'send-failed'),
    },
  });

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

  const result = await resolved.provider.sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
  });

  await prisma.whatsAppMessage.create({
    data: {
      tenantId: patient.tenantId,
      patientId: patient.id,
      direction: 'OUTBOUND',
      templateName: WHATSAPP_TEMPLATES.birthday,
      content: body,
      status: result.success ? initialStatus(resolved.ownLine) : 'FAILED',
      externalId: result.messageId ?? null,
      sentAt: result.success && !resolved.ownLine ? new Date() : null,
      errorMessage: result.success ? null : friendlyError(result.error ?? 'send-failed'),
    },
  });

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
