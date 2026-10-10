/**
 * Respostas rápidas — regras puras, usadas também na caixa de texto (cliente).
 */

/** Respostas rápidas: troca {nome} pelo primeiro nome do contato. */
export function fillQuickReply(body: string, name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return body.replace(/\{nome\}/gi, first).replace(/[ \t]+([,.!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}
