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
