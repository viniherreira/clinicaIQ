import type { WhatsAppProvider, SendMessageParams, SendMessageResult, WebhookPayload } from './types';

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly apiUrl: string;
  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor(config: { accessToken: string; phoneNumberId: string }) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    try {
      const body = params.templateName
        ? this.buildTemplateMessage(params)
        : this.buildTextMessage(params);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      const data = (await response.json()) as { messages?: Array<{ id: string }> };
      return {
        success: true,
        messageId: data.messages?.[0]?.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  parseWebhook(rawBody: unknown): WebhookPayload | null {
    try {
      const body = rawBody as Record<string, unknown>;
      const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
      const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
      const value = changes?.value as Record<string, unknown>;

      const statuses = value?.statuses as Array<Record<string, unknown>> | undefined;
      if (statuses?.[0]) {
        const status = statuses[0];
        return {
          from: String(status.recipient_id ?? ''),
          messageId: String(status.id ?? ''),
          timestamp: new Date().toISOString(),
          type: 'status',
          status: status.status as WebhookPayload['status'],
        };
      }

      const messages = value?.messages as Array<Record<string, unknown>> | undefined;
      const message = messages?.[0];
      if (!message) return null;

      const messageType = message.type as string;
      const interactive = message.interactive as Record<string, unknown> | undefined;
      const buttonReply = interactive?.button_reply as Record<string, string> | undefined;

      return {
        from: String(message.from ?? ''),
        messageId: String(message.id ?? ''),
        timestamp: String(message.timestamp ?? new Date().toISOString()),
        type: buttonReply ? 'button_reply' : 'text',
        text: (message.text as Record<string, string>)?.body,
        buttonReplyId: buttonReply?.id,
      };
    } catch {
      return null;
    }
  }

  private buildTemplateMessage(params: SendMessageParams) {
    return {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: 'pt_BR' },
        components: params.templateParams
          ? [
              {
                type: 'body',
                parameters: Object.values(params.templateParams).map((value) => ({
                  type: 'text',
                  text: value,
                })),
              },
            ]
          : undefined,
      },
    };
  }

  private buildTextMessage(params: SendMessageParams) {
    if (params.buttons?.length) {
      return {
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: params.body },
          action: {
            buttons: params.buttons.map((btn) => ({
              type: 'reply',
              reply: { id: btn.id, title: btn.title },
            })),
          },
        },
      };
    }

    return {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: { body: params.body },
    };
  }
}
