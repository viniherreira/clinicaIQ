import type { SendMessageParams, SendMessageResult, WebhookPayload, WhatsAppProvider } from './types';

export interface GatewayConfig {
  baseUrl: string;
  token: string;
  tenantId: string;
  /** Requests are user-facing (a booking is waiting), so fail fast. */
  timeoutMs?: number;
}

export type GatewayConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'QR_PENDING'
  | 'CONNECTED'
  | 'ERROR';

export interface GatewaySessionStatus {
  status: GatewayConnectionStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  live: boolean;
}

/**
 * Turns a failed HTTP call into a code the rest of the system can reason about.
 *
 * A timeout is the dangerous one: the gateway may well have delivered the
 * message after we stopped listening, so it must never be reported as a plain
 * failure that a retry would blindly duplicate. The gateway stamps the outbox
 * row with WhatsApp's message id before it replies, which is what makes that
 * retry safe — see `ref` in SendMessageParams.
 */
function classifyTransportError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || /timeout|aborted/i.test(error.message)) {
      return 'gateway-timeout';
    }
    if (error.message.startsWith('gateway-http-')) return error.message;
  }
  return 'gateway-unreachable';
}

/**
 * Talks to the ClinicaIQ WhatsApp gateway — the always-on service that holds one
 * WhatsApp Web socket per clinic. Unlike the Meta Cloud API there are no
 * templates or 24h windows: whatever the clinic would type by hand, we send as
 * plain text from their own number.
 */
export class GatewayWhatsAppProvider implements WhatsAppProvider {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly tenantId: string;
  private readonly timeoutMs: number;

  constructor(config: GatewayConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.tenantId = config.tenantId;
    // Must stay above the gateway's own worst case for a first-time contact
    // (number lookup, key exchange, first send) or we abort a request the socket
    // then completes — and the clinic sees a failure for a delivered message.
    // The gateway caps its lookup at 12s; 45s leaves real headroom above that.
    this.timeoutMs = config.timeoutMs ?? 45_000;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`gateway-http-${response.status}`);
    }
    return (await response.json()) as T;
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const body = params.body?.trim();
    if (!body) return { success: false, error: 'empty-body' };

    try {
      return await this.request<SendMessageResult>(
        `/sessions/${encodeURIComponent(this.tenantId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            to: params.to,
            body,
            buttons: params.buttons,
            ref: params.ref,
          }),
        },
      );
    } catch (error) {
      // Stable codes, not the runtime's English. These reach the clinic through
      // friendlyError, and they also decide whether a retry is worth attempting
      // — a timeout is; a 401 never will be.
      return { success: false, error: classifyTransportError(error) };
    }
  }

  /** The gateway owns the socket, so there is no inbound HTTP webhook here. */
  parseWebhook(): WebhookPayload | null {
    return null;
  }

  // ─── Pairing ────────────────────────────────────────────────────────────────

  async connect(): Promise<GatewaySessionStatus> {
    return this.request<GatewaySessionStatus>(
      `/sessions/${encodeURIComponent(this.tenantId)}/connect`,
      { method: 'POST' },
    );
  }

  async status(): Promise<GatewaySessionStatus> {
    return this.request<GatewaySessionStatus>(`/sessions/${encodeURIComponent(this.tenantId)}`);
  }

  async disconnect(): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(this.tenantId)}`, { method: 'DELETE' });
  }

  // ─── Campaigns ──────────────────────────────────────────────────────────────

  /**
   * Hands a prepared campaign to the gateway, which paces delivery and writes
   * results back to the database. Returns whether the gateway accepted it —
   * sending itself continues in the background, long after this resolves.
   */
  async startCampaign(campaignId: string): Promise<boolean> {
    try {
      await this.request(`/sessions/${encodeURIComponent(this.tenantId)}/campaigns`, {
        method: 'POST',
        body: JSON.stringify({ campaignId }),
      });
      return true;
    } catch {
      return false;
    }
  }
}

/** Whether a gateway is configured at all. */
export function gatewayConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_GATEWAY_URL && process.env.WHATSAPP_GATEWAY_TOKEN);
}

/** Builds a provider bound to one clinic, or null when the gateway is off. */
export function getGatewayProvider(tenantId: string): GatewayWhatsAppProvider | null {
  const baseUrl = process.env.WHATSAPP_GATEWAY_URL;
  const token = process.env.WHATSAPP_GATEWAY_TOKEN;
  if (!baseUrl || !token) return null;
  return new GatewayWhatsAppProvider({ baseUrl, token, tenantId });
}
