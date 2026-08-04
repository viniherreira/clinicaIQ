/**
 * Brazilian phone handling for every send path in the gateway.
 *
 * Mirrors the copy in apps/web/lib/whatsapp.ts — the app normalises a number
 * before it ever reaches us, so if the two disagree a number resolves one way in
 * the app and another here. Change them together.
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
 * The forms a Brazilian line may answer to. Mobile numbers gained a leading 9
 * after the area code in 2012 and records were never uniformly updated, so a
 * number stored one way often only exists on WhatsApp under the other.
 */
export function phoneVariants(digits: string): string[] {
  const out = new Set([digits]);
  const m = /^55(\d{2})(\d{8,9})$/.exec(digits);
  if (m) {
    const [, ddd, rest] = m;
    if (rest.length === 9 && rest.startsWith('9')) out.add(`55${ddd}${rest.slice(1)}`);
    if (rest.length === 8) out.add(`55${ddd}9${rest}`);
  }
  return [...out];
}
