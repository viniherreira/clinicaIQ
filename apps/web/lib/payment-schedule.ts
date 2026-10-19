import { paymentPlan, type PaymentTermsInput } from './payment-terms';

/**
 * O plano de pagamento de um orçamento, parcela por parcela, e quanto de cada
 * uma já foi pago. Puro e testado em `payment-schedule.test.ts`.
 *
 * Os valores saem de `paymentPlan` (o mesmo do PDF e do contrato): a soma das
 * parcelas bate com o total ao centavo. Datas são dias da clínica ("AAAA-MM-DD"):
 * a entrada (ou a primeira parcela, sem entrada) vence no dia em que o
 * orçamento foi aprovado; as outras, mês a mês.
 *
 * O dinheiro recebido não aponta para uma parcela: é distribuído em ordem, da
 * primeira para a última (como a clínica pensa: "pagou a entrada e duas").
 */

export interface ScheduleItem {
  /** "entrada", "p1", "p2"… ou "avista". */
  key: string;
  /** "Entrada", "Parcela 2 de 6", "À vista". */
  label: string;
  amount: number;
  /** AAAA-MM-DD */
  dueDate: string;
}

export type ScheduleStatus = 'paid' | 'partial' | 'open' | 'overdue';

export interface ScheduleLine extends ScheduleItem {
  paid: number;
  /** Quanto falta desta parcela. */
  due: number;
  status: ScheduleStatus;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Soma meses a um dia, sem pular mês: 31/01 + 1 → 28/02 (ou 29). */
export function addMonths(day: string, months: number): string {
  const [a, m, d] = day.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + months, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export function paymentSchedule(terms: PaymentTermsInput, startDay: string): ScheduleItem[] {
  const plan = paymentPlan(terms);
  const total = round2(Math.max(0, terms.total || 0));
  if (total <= 0) return [];
  if (plan.cash) {
    // À vista com "entrada" igual ao total ainda é à vista.
    return [{ key: 'avista', label: 'À vista', amount: total, dueDate: startDay }];
  }
  const out: ScheduleItem[] = [];
  if (plan.downPayment > 0) out.push({ key: 'entrada', label: 'Entrada', amount: plan.downPayment, dueDate: startDay });
  const desloca = plan.downPayment > 0 ? 1 : 0;
  for (let i = 0; i < plan.installments; i++) {
    const ultima = i === plan.installments - 1;
    out.push({
      key: `p${i + 1}`,
      label: plan.installments === 1 ? 'Parcela única' : `Parcela ${i + 1} de ${plan.installments}`,
      amount: ultima ? plan.lastInstallmentValue : plan.installmentValue,
      dueDate: addMonths(startDay, i + desloca),
    });
  }
  return out;
}

/** Distribui o que já foi pago pelas parcelas, em ordem, e diz a situação de cada uma hoje. */
export function allocatePayments(schedule: ScheduleItem[], paidTotal: number, today: string): ScheduleLine[] {
  let sobra = round2(Math.max(0, paidTotal));
  return schedule.map((it) => {
    const paid = round2(Math.min(it.amount, sobra));
    sobra = round2(sobra - paid);
    const due = round2(it.amount - paid);
    const status: ScheduleStatus = due <= 0 ? 'paid' : it.dueDate < today ? 'overdue' : paid > 0 ? 'partial' : 'open';
    return { ...it, paid, due, status };
  });
}

/** A próxima parcela que falta pagar (a atrasada vem primeiro, porque é a mais antiga). */
export function nextOpen(lines: ScheduleLine[]): ScheduleLine | null {
  return lines.find((l) => l.status !== 'paid') ?? null;
}

/** "Parcela 2 de 6" ou, se só uma parte da parcela foi paga antes, "Parcela 2 de 6 (restante)". */
export function paymentNote(line: ScheduleLine): string {
  return line.paid > 0 ? `${line.label} (restante)` : line.label;
}
