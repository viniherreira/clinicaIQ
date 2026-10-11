import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * O webhook da API oficial, lido como eventos simples. Função pura, testada por
 * tabela: o envelope da Meta é aninhado e cheio de campos opcionais.
 */

export type CloudKind = 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'LOCATION' | 'CONTACT' | 'OTHER';

export interface CloudContent {
  kind: CloudKind;
  text: string | null;
  /** Id da mídia na Meta. */
  mediaRef?: string;
  mimeType?: string;
  /** Botão ou item de lista tocado (id que nós mandamos). */
  buttonId?: string;
}

export type CloudEvent =
  | {
      kind: 'message';
      phoneNumberId: string;
      /** wa_id de quem escreveu. */
      from: string;
      contactName: string | null;
      id: string;
      at: Date;
      content: CloudContent;
    }
  | {
      /** Coexistência: escrito no app WhatsApp Business do celular da clínica. */
      kind: 'echo';
      phoneNumberId: string;
      to: string;
      id: string;
      at: Date;
      content: CloudContent;
    }
  | {
      kind: 'status';
      phoneNumberId: string;
      id: string;
      status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
      recipient: string;
      error: string | null;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const when = (ts: unknown) => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

/** O conteúdo de uma mensagem da Meta. Null = não é conversa (reação, sistema…). */
export function cloudContent(m: Any): CloudContent | null {
  switch (m?.type) {
    case 'text':
      return clean(m.text?.body) ? { kind: 'TEXT', text: clean(m.text.body) } : null;
    case 'interactive': {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      return r ? { kind: 'TEXT', text: clean(r.title), buttonId: clean(r.id) ?? undefined } : null;
    }
    case 'button':
      // Botão de resposta rápida de um modelo.
      return { kind: 'TEXT', text: clean(m.button?.text), buttonId: clean(m.button?.payload) ?? undefined };
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const media = m[m.type];
      return {
        kind: m.type.toUpperCase() as CloudKind,
        text: clean(media?.caption),
        mediaRef: clean(media?.id) ?? undefined,
        mimeType: clean(media?.mime_type) ?? undefined,
      };
    }
    case 'location':
      return { kind: 'LOCATION', text: clean(m.location?.name) ?? clean(m.location?.address) };
    case 'contacts':
      return { kind: 'CONTACT', text: clean(m.contacts?.[0]?.name?.formatted_name) };
    case 'reaction':
    case 'system':
    case 'ephemeral':
      return null;
    case 'unsupported':
    case 'order':
      return { kind: 'OTHER', text: null };
    default:
      return null;
  }
}

const STATUS: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

export function parseCloudWebhook(body: unknown): CloudEvent[] {
  const out: CloudEvent[] = [];
  const b = body as Any;
  if (b?.object !== 'whatsapp_business_account') return out;

  for (const entry of b.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      const phoneNumberId = clean(v?.metadata?.phone_number_id);
      if (!phoneNumberId) continue;

      if (change.field === 'messages') {
        const names = new Map<string, string>();
        for (const c of v.contacts ?? []) if (c?.wa_id && c?.profile?.name) names.set(c.wa_id, c.profile.name);

        for (const m of v.messages ?? []) {
          const content = cloudContent(m);
          if (!content || !m.id || !m.from) continue;
          out.push({ kind: 'message', phoneNumberId, from: String(m.from), contactName: names.get(m.from) ?? null, id: String(m.id), at: when(m.timestamp), content });
        }
        for (const s of v.statuses ?? []) {
          const status = STATUS[s?.status];
          if (!status || !s.id) continue;
          const e = s.errors?.[0];
          out.push({
            kind: 'status',
            phoneNumberId,
            id: String(s.id),
            status,
            recipient: String(s.recipient_id ?? ''),
            error: e ? clean(e.error_data?.details) ?? clean(e.title) ?? `erro ${e.code}` : null,
          });
        }
      }

      if (change.field === 'smb_message_echoes') {
        for (const m of v.message_echoes ?? []) {
          const content = cloudContent(m);
          if (!content || !m.id || !m.to) continue;
          out.push({ kind: 'echo', phoneNumberId, to: String(m.to), id: String(m.id), at: when(m.timestamp), content });
        }
      }
    }
  }
  return out;
}

/** Confere `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com o segredo do app). */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
