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
async function resolveProvider(
  tenantId: string,
  automation: WhatsAppAutomation,
): Promise<ResolvedProvider | null> {
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
  if (!enabled) return null;

  if (session?.status === 'CONNECTED') {
    const gateway = getGatewayProvider(tenantId);
    if (gateway) return { provider: gateway, ownLine: true };
  }

  // Birthday greetings are marketing, not transactional — Meta would reject them
  // without an approved template, so they only ride the clinic's own line.
  if (automation === 'birthday') return null;

  return { provider: getWhatsAppProvider(), ownLine: false };
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

  const resolved = await resolveProvider(appt.tenantId, isReminder ? 'reminder' : 'onCreate');
  if (!resolved) return { success: false, error: 'automation-disabled' };

  const result = await resolved.provider.sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
    // The clinic's own line is a normal WhatsApp account: plain text only, no
    // templates and no interactive buttons. On Meta with approved templates we
    // send the structured template + its {{1}}..{{5}} params instead
    // (business-initiated, no 24h window); buttons only ride the free-text
    // session path, and the webhook also understands a plain "CONFIRMAR" reply.
    ...(resolved.ownLine
      ? {}
      : templatesEnabled()
        ? { templateName, templateParams: appointmentTemplateParams(data) }
        : { buttons: isReminder ? CONFIRMATION_BUTTONS.map((b) => ({ ...b })) : undefined }),
  });

  await prisma.whatsAppMessage.create({
    data: {
      tenantId: appt.tenantId,
      patientId: appt.patient.id,
      appointmentId: appt.id,
      direction: 'OUTBOUND',
      templateName,
      content: body,
      status: result.success ? 'SENT' : 'FAILED',
      externalId: result.messageId ?? null,
      sentAt: result.success ? new Date() : null,
      errorMessage: result.success ? null : (result.error ?? 'send-failed'),
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
  const resolved = await resolveProvider(quote.tenantId, 'onCreate');
  if (!resolved) return { success: false, error: 'automation-disabled' };

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
      status: result.success ? 'SENT' : 'FAILED',
      externalId: result.messageId ?? null,
      sentAt: result.success ? new Date() : null,
      errorMessage: result.success ? null : (result.error ?? 'send-failed'),
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

  const resolved = await resolveProvider(patient.tenantId, 'birthday');
  if (!resolved) return { success: false, error: 'automation-disabled' };

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
      status: result.success ? 'SENT' : 'FAILED',
      externalId: result.messageId ?? null,
      sentAt: result.success ? new Date() : null,
      errorMessage: result.success ? null : (result.error ?? 'send-failed'),
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

/** Maps a button id (preferred) or free text to an appointment status. */
export function resolveResponseStatus(
  buttonReplyId?: string,
  text?: string,
): AppointmentStatus | null {
  if (buttonReplyId && BUTTON_TO_STATUS[buttonReplyId]) return BUTTON_TO_STATUS[buttonReplyId];
  const t = (text ?? '').toLowerCase();
  if (/\bconfirm/.test(t)) return 'CONFIRMED';
  if (/remarc|reagend/.test(t)) return 'RESCHEDULED';
  if (/cancel/.test(t)) return 'CANCELLED';
  return null;
}

/**
 * Resolves which appointment an inbound message refers to by matching the
 * sender's phone against recent confirmation messages (bounded window). Meta
 * webhooks identify the sender only by phone, and phones are encrypted at rest,
 * so we decrypt the small set of candidates rather than querying by plaintext.
 */
export async function resolveAppointmentByPhone(fromPhone: string): Promise<string | null> {
  const target = normalizeBrazilPhone(fromPhone);
  if (!target) return null;

  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.whatsAppMessage.findMany({
    where: {
      direction: 'OUTBOUND',
      templateName: WHATSAPP_TEMPLATES.appointmentConfirmation,
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
