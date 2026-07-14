export type { WhatsAppProvider, SendMessageParams, SendMessageResult, WebhookPayload } from './types';
export { MockWhatsAppProvider } from './mock-provider';
export { MetaWhatsAppProvider } from './meta-provider';
export { getWhatsAppProvider } from './factory';
export {
  WHATSAPP_TEMPLATES,
  CONFIRMATION_BUTTONS,
  firstName,
  buildAppointmentCreatedBody,
  buildAppointmentConfirmationBody,
  buildQuoteSentBody,
  appointmentTemplateParams,
  quoteTemplateParams,
} from './templates';
export type {
  WhatsAppTemplateName,
  ConfirmationButtonId,
  AppointmentMessageData,
  QuoteMessageData,
} from './templates';
