import { describe, expect, it } from 'vitest';
import { describePayment, paymentPlan, summarizePayment } from './payment-terms';

// Intl separa "R$" do número com espaço inquebrável; normalizar deixa as
// expectativas legíveis sem esconder nada do que importa.
const norm = (s: string) => s.replace(/ /g, ' ');

describe('paymentPlan', () => {
  it('sem entrada e parcela única é à vista', () => {
    const plan = paymentPlan({ total: 1500, downPayment: 0, installments: 1, method: 'PIX' });
    expect(plan.cash).toBe(true);
    expect(plan.installments).toBe(0);
  });

  it('entrada igual ao total é à vista, por mais parcelas que se peça', () => {
    const plan = paymentPlan({ total: 800, downPayment: 800, installments: 6, method: 'PIX' });
    expect(plan.cash).toBe(true);
  });

  it('a soma das parcelas bate com o saldo ao centavo', () => {
    const plan = paymentPlan({ total: 1000, downPayment: 0, installments: 3, method: null });
    expect(plan.installmentValue).toBe(333.33);
    expect(plan.lastInstallmentValue).toBe(333.34);
    const soma = plan.installmentValue * (plan.installments - 1) + plan.lastInstallmentValue;
    expect(Math.round(soma * 100)).toBe(100000);
  });

  it('entrada maior que o total é limitada ao total', () => {
    const plan = paymentPlan({ total: 300, downPayment: 900, installments: 2, method: null });
    expect(plan.downPayment).toBe(300);
    expect(plan.cash).toBe(true);
  });

  it('parcelas fora da faixa são trazidas para dentro', () => {
    expect(paymentPlan({ total: 2400, downPayment: 0, installments: 99, method: null }).installments).toBe(24);
    expect(paymentPlan({ total: 2400, downPayment: 100, installments: 0, method: null }).installments).toBe(1);
  });
});

describe('describePayment', () => {
  it('à vista com forma definida', () => {
    expect(describePayment({ total: 500, downPayment: 0, installments: 1, method: 'PIX' })).toBe(
      'À vista, via PIX.',
    );
  });

  it('à vista sem forma definida não inventa uma', () => {
    expect(describePayment({ total: 500, downPayment: 0, installments: 1, method: null })).toBe(
      'À vista, em forma a combinar com a clínica.',
    );
  });

  it('parcelado sem entrada', () => {
    expect(
      norm(describePayment({ total: 1200, downPayment: 0, installments: 6, method: 'CARTAO_CREDITO' })),
    ).toBe('Em 6 parcelas mensais de R$ 200,00, no cartão de crédito.');
  });

  it('entrada mais saldo parcelado', () => {
    expect(
      norm(describePayment({ total: 2000, downPayment: 500, installments: 5, method: 'BOLETO' })),
    ).toBe('Entrada de R$ 500,00 e saldo em 5 parcelas mensais de R$ 300,00, por boleto.');
  });

  it('entrada mais saldo em parcela única', () => {
    expect(
      norm(describePayment({ total: 1000, downPayment: 400, installments: 1, method: 'PIX' })),
    ).toBe('Entrada de R$ 400,00 e saldo em parcela única de R$ 600,00, via PIX.');
  });

  it('explicita a última parcela quando o arredondamento não fecha', () => {
    expect(norm(describePayment({ total: 1000, downPayment: 0, installments: 3, method: null }))).toBe(
      'Em 3 parcelas mensais, sendo 2 de R$ 333,33 e a última de R$ 333,34.',
    );
  });
});

describe('summarizePayment', () => {
  it('versões curtas', () => {
    expect(summarizePayment({ total: 500, downPayment: 0, installments: 1, method: 'PIX' })).toBe('À vista');
    expect(norm(summarizePayment({ total: 1200, downPayment: 0, installments: 6, method: null }))).toBe(
      '6x R$ 200,00',
    );
    expect(norm(summarizePayment({ total: 2000, downPayment: 500, installments: 5, method: null }))).toBe(
      'Entrada R$ 500,00 + 5x R$ 300,00',
    );
  });
});
