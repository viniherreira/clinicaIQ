import type { WhatsAppProvider, SendMessageParams, SendMessageResult, WebhookPayload } from './types';

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const messageId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    console.log('[WhatsApp Mock] Message sent:', {
      to: params.to,
      template: params.templateName,
      body: params.body,
      messageId,
    });

    return { success: true, messageId };
  }

  parseWebhook(rawBody: unknown): WebhookPayload | null {
    if (!rawBody || typeof rawBody !== 'object') return null;

    const body = rawBody as Record<string, unknown>;
    return {
      from: String(body.from ?? ''),
      messageId: String(body.messageId ?? ''),
      timestamp: new Date().toISOString(),
      type: (body.type as WebhookPayload['type']) ?? 'text',
      text: body.text as string | undefined,
      buttonReplyId: body.buttonReplyId as string | undefined,
    };
  }
}
