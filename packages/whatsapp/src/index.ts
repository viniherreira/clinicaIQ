export type { WhatsAppProvider, SendMessageParams, SendMessageResult, WebhookPayload } from './types';
export { MockWhatsAppProvider } from './mock-provider';
export { MetaWhatsAppProvider } from './meta-provider';
export {
  GatewayWhatsAppProvider,
  getGatewayProvider,
  gatewayConfigured,
} from './gateway-provider';
export type {
  GatewayConfig,
  GatewayConnectionStatus,
  GatewaySessionStatus,
} from './gateway-provider';
export { getWhatsAppProvider } from './factory';
export {
  WHATSAPP_TEMPLATES,
  CONFIRMATION_BUTTONS,
  CONFIRMATION_PROMPT,
  firstName,
  buildAppointmentCreatedBody,
  buildAppointmentConfirmationBody,
  buildQuoteSentBody,
  buildBirthdayBody,
  renderBirthdayTemplate,
  appointmentTemplateParams,
  quoteTemplateParams,
} from './templates';
export type {
  WhatsAppTemplateName,
  ConfirmationButtonId,
  AppointmentMessageData,
  QuoteMessageData,
  BirthdayMessageData,
} from './templates';
