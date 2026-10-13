import { describe, expect, it } from 'vitest';
import { cleanReceiptMethods, DEFAULT_RECEIPT_METHODS, readReceiptMethods } from './payment-methods';

describe('formas de recebimento', () => {
  it('sem nada salvo: a lista padrão', () => {
    expect(readReceiptMethods(null)).toEqual(DEFAULT_RECEIPT_METHODS);
    expect(readReceiptMethods({ paymentMethods: [] })).toEqual(DEFAULT_RECEIPT_METHODS);
  });

  it('a lista da clínica, limpa', () => {
    expect(readReceiptMethods({ paymentMethods: [' PIX ', 'pix', 'Convênio  Odonto', '', 3] })).toEqual(['PIX', 'Convênio Odonto']);
  });

  it('até 20 formas de até 40 letras', () => {
    const muitas = Array.from({ length: 30 }, (_, i) => `Forma ${i} ${'x'.repeat(50)}`);
    const r = cleanReceiptMethods(muitas);
    expect(r).toHaveLength(20);
    expect(r.every((m) => m.length <= 40)).toBe(true);
  });
});
