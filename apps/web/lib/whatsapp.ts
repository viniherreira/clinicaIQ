import { prisma, decrypt, type AppointmentStatus } from '@clinicaiq/db';
import {
  getWhatsAppProvider,
  WHATSAPP_TEMPLATES,
  CONFIRMATION_BUTTONS,
  buildAppointmentCreatedBody,
  buildAppointmentConfirmationBody,
  buildQuoteSentBody,
  type SendMessageResult,
  type AppointmentMessageData,
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

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

  const result = await getWhatsAppProvider().sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
    templateName,
    buttons: isReminder ? CONFIRMATION_BUTTONS.map((b) => ({ ...b })) : undefined,
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

  const body = buildQuoteSentBody({
    patientName: quote.patient.name,
    clinicName: quote.tenant.name,
    totalLabel: formatBRL(Number(quote.total)),
    validUntilLabel: format(quote.validUntil, 'dd/MM/yyyy'),
    link: `${appUrl()}/orcamento/${quote.publicToken}`,
  });

  const result = await getWhatsAppProvider().sendMessage({
    to: normalizeBrazilPhone(phone),
    body,
    templateName: WHATSAPP_TEMPLATES.quoteSent,
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
