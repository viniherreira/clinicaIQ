export interface SendMessageParams {
  to: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  body?: string;
  buttons?: Array<{
    id: string;
    title: string;
  }>;
  /** Id of the outbox row this send belongs to (for logs; Meta and mock ignore it). */
  ref?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WebhookPayload {
  from: string;
  messageId: string;
  timestamp: string;
  type: 'text' | 'button_reply' | 'status';
  text?: string;
  buttonReplyId?: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface WhatsAppProvider {
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  parseWebhook(rawBody: unknown): WebhookPayload | null;
}
