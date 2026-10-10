/**
 * O que uma mensagem do WhatsApp vira na conversa do CRM: o tipo e o texto.
 *
 * Função pura, sem Baileys nem Prisma, para dar para testar por tabela. Mensagem
 * que não é conversa de verdade (reação, edição, apagamento, recibo, troca de
 * chaves) devolve null e não é gravada.
 */

export type ChatKind =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'STICKER'
  | 'LOCATION'
  | 'CONTACT'
  | 'OTHER';

export interface ChatEntry {
  kind: ChatKind;
  /** Texto ou legenda. Null em mídia sem legenda. */
  text: string | null;
}

/** Embrulhos que só carregam outra mensagem dentro (temporária, ver uma vez…). */
const WRAPPERS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = Record<string, any>;

function unwrap(message: Msg | null | undefined): Msg | null {
  let m = message ?? null;
  for (let i = 0; m && i < 5; i++) {
    const inner = WRAPPERS.map((k) => m?.[k]?.message).find(Boolean);
    if (!inner) break;
    m = inner;
  }
  return m;
}

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

export function describeMessage(message: Msg | null | undefined): ChatEntry | null {
  const m = unwrap(message);
  if (!m) return null;

  // Não é conversa: reação, edição, apagamento, enquete votada, protocolo.
  if (m.protocolMessage || m.reactionMessage || m.editedMessage || m.pollUpdateMessage || m.keepInChatMessage) {
    return null;
  }

  const text = clean(m.conversation) ?? clean(m.extendedTextMessage?.text);
  if (text) return { kind: 'TEXT', text };

  // Botão tocado: fica o texto do botão, que é o que a pessoa "disse".
  const tapped =
    clean(m.buttonsResponseMessage?.selectedDisplayText) ??
    clean(m.templateButtonReplyMessage?.selectedDisplayText) ??
    clean(m.listResponseMessage?.title) ??
    clean(m.interactiveResponseMessage?.body?.text);
  if (tapped) return { kind: 'TEXT', text: tapped };

  // Mensagem com botões (as confirmações que o sistema manda).
  const withButtons =
    clean(m.interactiveMessage?.body?.text) ??
    clean(m.buttonsMessage?.contentText) ??
    clean(m.templateMessage?.hydratedTemplate?.hydratedContentText);
  if (withButtons) return { kind: 'TEXT', text: withButtons };

  if (m.imageMessage) return { kind: 'IMAGE', text: clean(m.imageMessage.caption) };
  if (m.videoMessage || m.ptvMessage) return { kind: 'VIDEO', text: clean(m.videoMessage?.caption) };
  if (m.audioMessage) return { kind: 'AUDIO', text: null };
  if (m.documentMessage) return { kind: 'DOCUMENT', text: clean(m.documentMessage.caption) };
  if (m.stickerMessage) return { kind: 'STICKER', text: null };
  if (m.locationMessage || m.liveLocationMessage) return { kind: 'LOCATION', text: null };
  if (m.contactMessage || m.contactsArrayMessage) return { kind: 'CONTACT', text: null };
  if (m.pollCreationMessage || m.pollCreationMessageV3) {
    return { kind: 'OTHER', text: clean(m.pollCreationMessage?.name ?? m.pollCreationMessageV3?.name) };
  }

  // Desconhecido: melhor não gravar do que encher a conversa de linhas vazias.
  return null;
}

/** Começo da mensagem para a lista de conversas. */
export function previewOf(entry: ChatEntry): string {
  const LABEL: Record<ChatKind, string> = {
    TEXT: '',
    IMAGE: 'Foto',
    AUDIO: 'Áudio',
    VIDEO: 'Vídeo',
    DOCUMENT: 'Documento',
    STICKER: 'Figurinha',
    LOCATION: 'Localização',
    CONTACT: 'Contato',
    OTHER: 'Mensagem',
  };
  const base = entry.kind === 'TEXT' ? entry.text ?? '' : [LABEL[entry.kind], entry.text].filter(Boolean).join(': ');
  return base.replace(/\s+/g, ' ').slice(0, 120);
}

/** Hora da mensagem no WhatsApp (segundos, às vezes como Long do protobuf). */
export function messageTime(ts: unknown, fallback: Date = new Date()): Date {
  const n = typeof ts === 'number' ? ts : Number((ts as { toString?: () => string })?.toString?.() ?? NaN);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : fallback;
}
