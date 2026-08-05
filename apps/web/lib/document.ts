/**
 * CPF and CNPJ, the two documents a Brazilian clinic can bill under.
 *
 * Validated here rather than left to the payment gateway: an invalid document
 * only surfaces at the moment the clinic tries to subscribe, in the gateway's
 * own wording, after a customer record has already been created. Catching it
 * first means one clear message and nothing half-created.
 */

export type DocumentKind = 'CPF' | 'CNPJ';

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** Weighted mod-11 check digit, shared by both documents. */
function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCPF(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11) return false;
  // 111.111.111-11 and friends pass the arithmetic but are never real.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const first = checkDigit(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(d[9]) && second === Number(d[10]);
}

export function isValidCNPJ(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const first = checkDigit(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(d[12]) && second === Number(d[13]);
}

export function documentKind(value: string): DocumentKind | null {
  const d = onlyDigits(value);
  if (d.length === 11) return isValidCPF(d) ? 'CPF' : null;
  if (d.length === 14) return isValidCNPJ(d) ? 'CNPJ' : null;
  return null;
}

export const isValidDocument = (value: string): boolean => documentKind(value) !== null;

/** `12.345.678/0001-95` or `123.456.789-09`, whichever fits. */
export function formatDocument(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

/** Why a document was rejected, in words the clinic can act on. */
export function documentError(value: string): string | null {
  const d = onlyDigits(value);
  if (!d) return 'Informe o CPF ou CNPJ.';
  if (d.length !== 11 && d.length !== 14) {
    return 'CPF deve ter 11 dígitos e CNPJ, 14.';
  }
  if (d.length === 11 && !isValidCPF(d)) return 'CPF inválido. Confira os números.';
  if (d.length === 14 && !isValidCNPJ(d)) return 'CNPJ inválido. Confira os números.';
  return null;
}
