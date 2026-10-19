import { describe, expect, it } from 'vitest';
import { addMonths, allocatePayments, nextOpen, paymentNote, paymentSchedule } from './payment-schedule';

describe('plano de pagamento', () => {
  it('à vista: uma linha no dia da aprovação', () => {
    expect(paymentSchedule({ total: 900, downPayment: 0, installments: 1, method: 'PIX' }, '2026-10-19')).toEqual([
      { key: 'avista', label: 'À vista', amount: 900, dueDate: '2026-10-19' },
    ]);
  });

  it('entrada no dia e o saldo mês a mês; a última absorve o arredondamento', () => {
    const s = paymentSchedule({ total: 1500, downPayment: 500, installments: 3, method: null }, '2026-10-19');
    expect(s.map((x) => [x.label, x.amount, x.dueDate])).toEqual([
      ['Entrada', 500, '2026-10-19'],
      ['Parcela 1 de 3', 333.33, '2026-11-19'],
      ['Parcela 2 de 3', 333.33, '2026-12-19'],
      ['Parcela 3 de 3', 333.34, '2027-01-19'],
    ]);
    expect(s.reduce((t, x) => t + x.amount, 0)).toBeCloseTo(1500, 2);
  });

  it('sem entrada: a primeira parcela vence no dia', () => {
    const s = paymentSchedule({ total: 600, downPayment: 0, installments: 2, method: 'CARTAO_CREDITO' }, '2026-10-19');
    expect(s.map((x) => x.dueDate)).toEqual(['2026-10-19', '2026-11-19']);
  });

  it('mês curto não pula: 31/01 + 1 mês = 28/02', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15');
  });

  it('orçamento zerado não tem plano', () => {
    expect(paymentSchedule({ total: 0, downPayment: 0, installments: 1, method: null }, '2026-10-19')).toEqual([]);
  });
});

describe('o que já foi pago', () => {
  const plano = paymentSchedule({ total: 1500, downPayment: 500, installments: 3, method: null }, '2026-10-19');

  it('distribui em ordem: entrada paga, primeira parcela pela metade', () => {
    const l = allocatePayments(plano, 666.67, '2026-11-01');
    expect(l.map((x) => [x.status, x.paid, x.due])).toEqual([
      ['paid', 500, 0],
      ['partial', 166.67, 166.66],
      ['open', 0, 333.33],
      ['open', 0, 333.34],
    ]);
    expect(nextOpen(l)?.label).toBe('Parcela 1 de 3');
    expect(paymentNote(nextOpen(l)!)).toBe('Parcela 1 de 3 (restante)');
  });

  it('vencida e não paga fica atrasada', () => {
    const l = allocatePayments(plano, 500, '2026-12-01');
    expect(l.map((x) => x.status)).toEqual(['paid', 'overdue', 'open', 'open']);
  });

  it('tudo pago', () => {
    const l = allocatePayments(plano, 1500, '2027-03-01');
    expect(l.every((x) => x.status === 'paid')).toBe(true);
    expect(nextOpen(l)).toBeNull();
  });
});
