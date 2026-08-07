import { timingSafeEqual } from 'node:crypto';

/**
 * Compara um segredo recebido com o esperado sem vazar tempo.
 *
 * `a === b` on strings short-circuits at the first differing byte, so the time
 * it takes leaks how many leading characters were right. Over the public
 * internet the jitter usually buries that signal — but these endpoints (cron,
 * webhooks, gateway) guard payment state and every clinic's data, and the fix
 * is one function.
 *
 * Falta de segredo configurado nega tudo, em vez de liberar.
 */
export function secretMatches(received: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !received) return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual exige o mesmo comprimento; comparar antes revela só o
  // tamanho do segredo, que não é o que protege.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Extrai e confere um cabeçalho `Authorization: Bearer <segredo>`. */
export function bearerMatches(req: Request, expected: string | undefined): boolean {
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  return secretMatches(header.slice(7), expected);
}
