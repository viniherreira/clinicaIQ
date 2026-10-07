import { describe, expect, it } from 'vitest';
import { chargeStatusFromEvent, toChargeStatus } from './asaas-events';

describe('chargeStatusFromEvent', () => {
  it('cobrança removida fica cancelada, qualquer que seja o último status', () => {
    // O caso real: o Asaas avisa a remoção mandando o pagamento ainda "vencido".
    expect(chargeStatusFromEvent('PAYMENT_DELETED', { status: 'OVERDUE' })).toBe('CANCELLED');
    expect(chargeStatusFromEvent('PAYMENT_DELETED', { status: 'PENDING' })).toBe('CANCELLED');
  });

  it('a bandeira `deleted` vale mesmo sem o nome do evento', () => {
    expect(chargeStatusFromEvent(undefined, { status: 'PENDING', deleted: true })).toBe('CANCELLED');
  });

  it('nos outros eventos, segue o status do pagamento', () => {
    expect(chargeStatusFromEvent('PAYMENT_RECEIVED', { status: 'RECEIVED' })).toBe('PAID');
    expect(chargeStatusFromEvent('PAYMENT_OVERDUE', { status: 'OVERDUE' })).toBe('OVERDUE');
    expect(chargeStatusFromEvent('PAYMENT_CREATED', { status: 'PENDING', deleted: false })).toBe('PENDING');
  });
});

describe('toChargeStatus', () => {
  it('mapeia os estados do Asaas', () => {
    expect(toChargeStatus('CONFIRMED')).toBe('PAID');
    expect(toChargeStatus('RECEIVED_IN_CASH')).toBe('PAID');
    expect(toChargeStatus('REFUND_REQUESTED')).toBe('REFUNDED');
    expect(toChargeStatus('DELETED')).toBe('CANCELLED');
    expect(toChargeStatus('AWAITING_RISK_ANALYSIS')).toBe('PENDING');
  });
});
