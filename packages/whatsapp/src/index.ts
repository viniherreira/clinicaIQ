export type { WhatsAppProvider, SendMessageParams, SendMessageResult, WebhookPayload } from './types';
export { MockWhatsAppProvider } from './mock-provider';
export { MetaWhatsAppProvider } from './meta-provider';
export { getWhatsAppProvider } from './factory';
export {
  WHATSAPP_TEMPLATES,
  CONFIRMATION_BUTTONS,
  buildAppointmentCreatedBody,
  buildAppointmentConfirmationBody,
  buildQuoteSentBody,
} from './templates';
export type {
  WhatsAppTemplateName,
  ConfirmationButtonId,
  AppointmentMessageData,
  QuoteMessageData,
} from './templates';
