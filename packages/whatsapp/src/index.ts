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
  renderAppointmentTemplate,
  APPOINTMENT_PLACEHOLDERS,
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
export {
  CloudApi,
  CloudApiError,
  DEFAULT_GRAPH_VERSION,
  countTemplateVariables,
  describeGraphError,
  exchangeSignupCode,
  renderTemplateBody,
} from './cloud-api';
export type { CloudButton, CloudConfig, GraphTemplate } from './cloud-api';
export { cloudContent, parseCloudWebhook, verifyMetaSignature } from './cloud-webhook';
export type { CloudContent, CloudEvent, CloudKind } from './cloud-webhook';
