/**
 * Tradução dos estados do Asaas para os nossos. Puro, fora de `asaas.ts` (que
 * é server-only), para poder ser testado.
 */

export type ChargeStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'REFUNDED' | 'CANCELLED';

/** Maps Asaas payment status onto our ChargeStatus. */
export function toChargeStatus(status: string): ChargeStatus {
  switch (status) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'PAID';
    case 'OVERDUE':
      return 'OVERDUE';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
      return 'REFUNDED';
    case 'DELETED':
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

/**
 * Status da cobrança a partir de um evento de webhook.
 *
 * O evento manda mais que o `status` do pagamento. Quando uma cobrança é
 * removida, o Asaas avisa com `PAYMENT_DELETED` e manda o pagamento com o
 * último status que ele tinha — "PENDING" ou "OVERDUE". Ler só o status
 * reabria o boleto que acabamos de cancelar e marcava a clínica como
 * inadimplente três segundos depois de ela deixar de dever qualquer coisa: foi
 * o que aconteceu na primeira cortesia concedida.
 */
export function chargeStatusFromEvent(
  event: string | undefined,
  payment: { status?: string; deleted?: boolean },
): ChargeStatus {
  if (event === 'PAYMENT_DELETED' || payment.deleted) return 'CANCELLED';
  return toChargeStatus(payment.status ?? '');
}
