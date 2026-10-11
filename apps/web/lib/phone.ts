/**
 * Brazilian phone handling for the app's WhatsApp paths.
 *
 * Mirrors apps/whatsapp-gateway/src/phone.ts — the app normalises a number
 * before it reaches the gateway, so if the two disagree a number resolves one
 * way here and another there. Change them together.
 */

/**
 * Digits-only E.164 for a Brazilian number.
 *
 * Decided by *length*, never by a leading `55`: DDD 55 is Santa Maria and
 * Uruguaiana in Rio Grande do Sul, so a perfectly local `55 9 9999-8888` starts
 * with the country code's digits while carrying no country code at all. Testing
 * the prefix left that whole region unreachable — the number went out with 11
 * digits, WhatsApp read it as country 55 + DDD 99, and every lookup came back
 * "this number has no WhatsApp".
 *
 * Lengths are unambiguous, so they decide instead:
 *   10-11 digits → DDD + 8-or-9-digit line, still needs the country code
 *   12-13 digits → already 55 + DDD + line
 */
export function normalizeBrazilPhone(raw: string): string {
  // Strip the trunk prefix people type out of habit: (011) 98765-4321.
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  // Already E.164, or malformed. Hand it on untouched so the server lookup
  // rejects it explicitly rather than us inventing a country code for it.
  return digits;
}

/**
 * A chave de uma conversa de WhatsApp: o número normalizado, com celular sempre
 * na forma de 9 dígitos.
 *
 * O WhatsApp ainda identifica muitos celulares antigos sem o 9 (`55 11 9999-8888`)
 * enquanto o cadastro tem com o 9 — a mesma pessoa viraria duas conversas.
 * Número de 8 dígitos começando com 6 a 9 é celular sem o 9; de 2 a 5 é fixo e
 * fica como está.
 *
 * Mirrors the copy in the other side (apps/web/lib/phone.ts ⇄
 * apps/whatsapp-gateway/src/phone.ts): the gateway writes conversations under
 * this key and the app looks them up with it. Change them together.
 */
export function chatKey(raw: string): string {
  const digits = normalizeBrazilPhone(raw);
  const m = /^55(\d{2})([6-9]\d{7})$/.exec(digits);
  return m ? `55${m[1]}9${m[2]}` : digits;
}
