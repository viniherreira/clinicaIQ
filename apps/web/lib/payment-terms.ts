/**
 * Condições de pagamento de um orçamento, escritas do jeito que a clínica fala.
 *
 * Puro e sem I/O de propósito: a mesma frase sai na tela do construtor, no PDF
 * do orçamento, na página do paciente e na cláusula de preço do contrato. Se
 * cada um montasse a sua, bastaria um arredondamento diferente para o contrato
 * dizer "3x de R$ 333,33" e o orçamento "3x de R$ 333,34" — e o paciente
 * assinaria um valor que não fecha com o que aprovou.
 */

export const PAYMENT_METHODS = [
  { value: 'PIX', label: 'PIX', preposicao: 'via PIX' },
  { value: 'DINHEIRO', label: 'Dinheiro', preposicao: 'em dinheiro' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de crédito', preposicao: 'no cartão de crédito' },
  { value: 'CARTAO_DEBITO', label: 'Cartão de débito', preposicao: 'no cartão de débito' },
  { value: 'BOLETO', label: 'Boleto', preposicao: 'por boleto' },
  { value: 'TRANSFERENCIA', label: 'Transferência bancária', preposicao: 'por transferência bancária' },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

/** Teto de parcelas. Cartão costuma ir até 12; boleto parcelado, até 24. */
export const MAX_INSTALLMENTS = 24;

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === 'string' && PAYMENT_METHODS.some((m) => m.value === v);
}

export function paymentMethodLabel(v: string | null | undefined): string | null {
  return PAYMENT_METHODS.find((m) => m.value === v)?.label ?? null;
}

export interface PaymentTermsInput {
  total: number;
  downPayment: number;
  installments: number;
  method: string | null | undefined;
}

export interface PaymentPlan {
  /** Entrada efetiva, já limitada ao total. */
  downPayment: number;
  /** Saldo depois da entrada. */
  remaining: number;
  /** Parcelas do saldo. Zero quando é à vista. */
  installments: number;
  /** Valor de cada parcela, menos a última. */
  installmentValue: number;
  /** A última absorve a sobra do arredondamento (1000 ÷ 3 → 333,33 + 333,33 + 333,34). */
  lastInstallmentValue: number;
  cash: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export function paymentPlan({ total, downPayment, installments }: PaymentTermsInput): PaymentPlan {
  const t = Math.max(0, round2(total || 0));
  const down = Math.min(t, Math.max(0, round2(downPayment || 0)));
  const remaining = round2(t - down);
  const n = Math.min(MAX_INSTALLMENTS, Math.max(1, Math.floor(installments || 1)));

  // À vista: sem saldo depois da entrada, ou uma parcela única sem entrada.
  if (remaining <= 0 || (down === 0 && n === 1)) {
    return {
      downPayment: down,
      remaining: 0,
      installments: 0,
      installmentValue: 0,
      lastInstallmentValue: 0,
      cash: true,
    };
  }

  // Arredonda para baixo e joga a diferença na última: nenhuma parcela passa do
  // valor justo, e a soma bate com o total ao centavo.
  const value = Math.floor((remaining / n) * 100) / 100;
  const last = round2(remaining - value * (n - 1));
  return {
    downPayment: down,
    remaining,
    installments: n,
    installmentValue: value,
    lastInstallmentValue: last,
    cash: false,
  };
}

function viaMetodo(method: string | null | undefined): string {
  const m = PAYMENT_METHODS.find((x) => x.value === method);
  return m ? `, ${m.preposicao}` : '';
}

function parcelas(plan: PaymentPlan): string {
  const { installments: n, installmentValue: v, lastInstallmentValue: last } = plan;
  if (n === 1) return `parcela única de ${brl(last)}`;
  if (last === v) return `${n} parcelas mensais de ${brl(v)}`;
  return `${n} parcelas mensais, sendo ${n - 1} de ${brl(v)} e a última de ${brl(last)}`;
}

/**
 * A frase completa, pronta para documento.
 *
 * - "À vista, via PIX."
 * - "Em 6 parcelas mensais de R$ 166,67, no cartão de crédito."
 * - "Entrada de R$ 500,00 e saldo em 5 parcelas mensais de R$ 300,00, por boleto."
 */
export function describePayment(input: PaymentTermsInput): string {
  const plan = paymentPlan(input);
  const via = viaMetodo(input.method);

  if (plan.cash) {
    return input.method ? `À vista${via}.` : 'À vista, em forma a combinar com a clínica.';
  }
  if (plan.downPayment > 0) {
    return `Entrada de ${brl(plan.downPayment)} e saldo em ${parcelas(plan)}${via}.`;
  }
  return `Em ${parcelas(plan)}${via}.`;
}

/** Versão curta para tabela e etiqueta: "À vista", "6x R$ 166,67", "Entrada + 5x R$ 300,00". */
export function summarizePayment(input: PaymentTermsInput): string {
  const plan = paymentPlan(input);
  if (plan.cash) return 'À vista';
  const parcela = `${plan.installments}x ${brl(plan.installmentValue)}`;
  return plan.downPayment > 0 ? `Entrada ${brl(plan.downPayment)} + ${parcela}` : parcela;
}
