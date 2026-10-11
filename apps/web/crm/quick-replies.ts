/**
 * Respostas rápidas — regras puras, usadas também na caixa de texto (cliente).
 */

/** Respostas rápidas: troca {nome} pelo primeiro nome do contato. */
export function fillQuickReply(body: string, name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return body.replace(/\{nome\}/gi, first).replace(/[ \t]+([,.!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * O atalho como a pessoa digita depois da barra: minúsculo, sem acento nem
 * espaço ("Horários de sábado" → "horarios-de-sabado").
 */
export function normalizeShortcut(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export const MAX_QUICK_REPLY = 1000;
