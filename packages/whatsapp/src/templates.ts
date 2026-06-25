/**
 * Message templates for the three transactional flows ClinicaIQ sends.
 *
 * The `name` constants mirror the template names that must be registered and
 * approved in the Meta WhatsApp Manager (see docs/WHATSAPP_SETUP.md). The body
 * builders produce the plain-text fallback used by the mock provider in dev and
 * by Meta's free-form session messages; the structured template params are what
 * Meta substitutes into the approved template at send time.
 */

export const WHATSAPP_TEMPLATES = {
  appointmentCreated: 'appointment_created',
  appointmentConfirmation: 'appointment_confirmation',
  quoteSent: 'quote_sent',
} as const;

export type WhatsAppTemplateName =
  (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES];

/** Reply buttons attached to the confirmation message. Ids are stable and are
 *  what the webhook maps back to an appointment status. */
export const CONFIRMATION_BUTTONS = [
  { id: 'confirm', title: 'Confirmar' },
  { id: 'reschedule', title: 'Remarcar' },
  { id: 'cancel', title: 'Cancelar' },
] as const;

export type ConfirmationButtonId = (typeof CONFIRMATION_BUTTONS)[number]['id'];

export interface AppointmentMessageData {
  patientName: string;
  clinicName: string;
  professionalName: string;
  procedureName?: string | null;
  /** e.g. "quinta-feira, 28/05" */
  dateLabel: string;
  /** e.g. "14:30" */
  timeLabel: string;
}

/** First name only — friendlier and avoids overrunning the bubble. */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

export function buildAppointmentCreatedBody(d: AppointmentMessageData): string {
  const proc = d.procedureName ? ` (${d.procedureName})` : '';
  return (
    `Olá, ${firstName(d.patientName)}! 👋\n\n` +
    `Seu agendamento na *${d.clinicName}* foi registrado:\n\n` +
    `📅 ${d.dateLabel} às ${d.timeLabel}\n` +
    `👩‍⚕️ ${d.professionalName}${proc}\n\n` +
    `Em breve enviaremos um lembrete para você confirmar. Até lá!`
  );
}

export function buildAppointmentConfirmationBody(d: AppointmentMessageData): string {
  const proc = d.procedureName ? ` (${d.procedureName})` : '';
  return (
    `Olá, ${firstName(d.patientName)}! Passando para lembrar do seu horário na ` +
    `*${d.clinicName}*:\n\n` +
    `📅 ${d.dateLabel} às ${d.timeLabel}\n` +
    `👩‍⚕️ ${d.professionalName}${proc}\n\n` +
    `Podemos confirmar sua presença?`
  );
}

export interface QuoteMessageData {
  patientName: string;
  clinicName: string;
  /** Already formatted, e.g. "R$ 2.450,00" */
  totalLabel: string;
  /** e.g. "15/07/2026" */
  validUntilLabel: string;
  link: string;
}

export function buildQuoteSentBody(d: QuoteMessageData): string {
  return (
    `Olá, ${firstName(d.patientName)}! 😊\n\n` +
    `A *${d.clinicName}* preparou um orçamento para você no valor de ` +
    `*${d.totalLabel}*.\n\n` +
    `Você pode visualizar os detalhes e responder por aqui:\n${d.link}\n\n` +
    `Válido até ${d.validUntilLabel}.`
  );
}
