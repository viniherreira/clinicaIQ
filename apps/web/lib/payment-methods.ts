/**
 * Formas de recebimento que a clínica usa ao lançar um pagamento (ficha do
 * paciente e orçamento). Guardadas em `Tenant.settings.paymentMethods`;
 * Configurações → Financeiro. Puro e testado em `payment-methods.test.ts`.
 *
 * Não confundir com `PAYMENT_METHODS` (`payment-terms.ts`), a forma combinada
 * no orçamento, que sai escrita no PDF e no contrato.
 */

export const DEFAULT_RECEIPT_METHODS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto', 'Outro'];
export const MAX_RECEIPT_METHODS = 20;

/** Limpa a lista: sem espaços sobrando, sem repetir (ignorando maiúsculas), até 40 letras cada. */
export function cleanReceiptMethods(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const t = v.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!t || vistos.has(t.toLowerCase())) continue;
    vistos.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, MAX_RECEIPT_METHODS);
}

export function readReceiptMethods(settings: unknown): string[] {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).paymentMethods : undefined;
  const lista = cleanReceiptMethods(raw);
  return lista.length ? lista : DEFAULT_RECEIPT_METHODS;
}
