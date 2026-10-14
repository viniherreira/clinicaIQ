/**
 * Que arquivos o CRM manda pelo WhatsApp. Puro: a caixa de texto confere antes
 * de subir e o servidor confere de novo.
 *
 * Os tipos são os que a API oficial aceita. O teto de 10 MB fica abaixo do
 * limite das Server Actions (12 MB, `next.config`) e do vídeo/áudio da Meta
 * (16 MB); foto tem o teto da própria Meta, 5 MB.
 */

export type ChatMediaKind = 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';

const MB = 1024 * 1024;
export const MAX_MEDIA_BYTES = 10 * MB;
const MAX_IMAGE_BYTES = 5 * MB;

const KIND_BY_MIME: Record<string, ChatMediaKind> = {
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'video/mp4': 'VIDEO',
  'video/3gpp': 'VIDEO',
  'audio/mpeg': 'AUDIO',
  'audio/mp4': 'AUDIO',
  'audio/aac': 'AUDIO',
  'audio/ogg': 'AUDIO',
  'audio/amr': 'AUDIO',
  'application/pdf': 'DOCUMENT',
  'application/msword': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCUMENT',
  'application/vnd.ms-excel': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'DOCUMENT',
  'application/vnd.ms-powerpoint': 'DOCUMENT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'DOCUMENT',
  'text/plain': 'DOCUMENT',
};

/** Para o `accept` do seletor de arquivo. */
export const CHAT_MEDIA_ACCEPT = Object.keys(KIND_BY_MIME).join(',');

export const MEDIA_KIND_LABEL: Record<ChatMediaKind, string> = {
  IMAGE: 'Foto',
  DOCUMENT: 'Documento',
  AUDIO: 'Áudio',
  VIDEO: 'Vídeo',
};

export type MediaCheck = { ok: true; kind: ChatMediaKind; mimeType: string } | { ok: false; message: string };

export function checkChatMedia(file: { type: string; size: number; name: string }): MediaCheck {
  const mimeType = (file.type || '').toLowerCase().split(';')[0].trim();
  const kind = KIND_BY_MIME[mimeType];
  if (!kind) return { ok: false, message: 'Esse tipo de arquivo não vai pelo WhatsApp. Use foto (JPG, PNG), PDF, documento do Office, áudio ou vídeo MP4.' };
  if (file.size <= 0) return { ok: false, message: 'O arquivo está vazio.' };
  if (kind === 'IMAGE' && file.size > MAX_IMAGE_BYTES) return { ok: false, message: 'Foto de até 5 MB.' };
  if (file.size > MAX_MEDIA_BYTES) return { ok: false, message: 'Arquivo de até 10 MB.' };
  return { ok: true, kind, mimeType };
}

/** Nome seguro para guardar e para o WhatsApp mostrar: sem pasta, sem caractere estranho. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const limpo = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(-80);
  return limpo || 'arquivo';
}

/**
 * Tipos que o navegador pode abrir dentro do DreamClin sem rodar código.
 * HTML, SVG e XML ficam de fora de propósito: abertos no nosso domínio, rodariam
 * script com a sessão de quem clicou.
 */
const INLINE_SAFE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

/**
 * Cabeçalhos para entregar um arquivo de conversa.
 *
 * O tipo do arquivo vem de fora: quem manda o documento pelo WhatsApp escolhe o
 * que a Meta repassa, e quem sobe pelo CRM escolhe o `type` do navegador. Um
 * contato podia mandar um `.html` e, quando a recepção clicasse para abrir, o
 * script rodaria logado no CRM. Fora da lista segura, o arquivo só baixa, como
 * binário; e o `sandbox` impede script mesmo se algo escapar.
 */
export function mediaResponseHeaders(mimeType: string | null | undefined, fileName?: string): Record<string, string> {
  const tipo = (mimeType || '').toLowerCase().split(';')[0].trim();
  const seguro = INLINE_SAFE.has(tipo) || tipo.startsWith('audio/') || tipo.startsWith('video/');
  const nome = safeFileName(fileName || 'arquivo');
  return {
    'content-type': seguro ? tipo : 'application/octet-stream',
    'content-disposition': `${seguro ? 'inline' : 'attachment'}; filename="${nome}"`,
    // O Chrome não abre PDF numa página com sandbox; o leitor de PDF dele já não
    // roda script no nosso domínio.
    ...(tipo === 'application/pdf'
      ? {}
      : { 'content-security-policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'" }),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  };
}

/** "1,2 MB", "340 KB". */
export function formatBytes(n: number): string {
  if (n >= MB) return `${(n / MB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
