import { describe, expect, it } from 'vitest';
import {
  GRACE_DAYS,
  NO_SUBSCRIPTION,
  canWrite,
  resolveAccess,
  type SubscriptionSnapshot,
} from './subscription';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-03T12:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const snapshot = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  status: 'ACTIVE',
  trialEndsAt: null,
  currentPeriodEnd: at(20),
  graceEndsAt: null,
  cancelledAt: null,
  ...over,
});

describe('resolveAccess', () => {
  it('libera tudo com a mensalidade em dia', () => {
    const access = resolveAccess(snapshot(), NOW);
    expect(access.level).toBe('full');
    expect(access.warning).toBeNull();
    expect(canWrite(access)).toBe(true);
  });

  it('não avisa nada no começo do teste gratuito', () => {
    const access = resolveAccess(snapshot({ status: 'TRIALING', trialEndsAt: at(14) }), NOW);
    expect(access.level).toBe('full');
    expect(access.warning).toBeNull();
    expect(access.daysLeft).toBe(14);
  });

  it('avisa quando o teste está perto do fim', () => {
    const access = resolveAccess(snapshot({ status: 'TRIALING', trialEndsAt: at(3) }), NOW);
    expect(access.level).toBe('full');
    expect(access.warning).toContain('3 dias');
  });

  it('usa singular com um dia restante', () => {
    const access = resolveAccess(snapshot({ status: 'TRIALING', trialEndsAt: at(1) }), NOW);
    expect(access.warning).toContain('1 dia');
    expect(access.warning).not.toContain('1 dias');
  });

  it('dá a mesma tolerância a um teste vencido', () => {
    const access = resolveAccess(snapshot({ status: 'TRIALING', trialEndsAt: at(-2) }), NOW);
    expect(access.level).toBe('full');
    expect(access.status).toBe('PAST_DUE');
    expect(access.inGrace).toBe(true);
  });

  it('mantém o acesso durante a tolerância de quem venceu', () => {
    const access = resolveAccess(snapshot({ currentPeriodEnd: at(-3) }), NOW);
    expect(access.level).toBe('full');
    expect(access.status).toBe('PAST_DUE');
    expect(access.daysLeft).toBe(GRACE_DAYS - 3);
    expect(access.warning).toContain('atraso');
  });

  it('limita a escrita quando a tolerância acaba', () => {
    const access = resolveAccess(snapshot({ currentPeriodEnd: at(-GRACE_DAYS - 1) }), NOW);
    expect(access.level).toBe('readonly');
    expect(access.status).toBe('SUSPENDED');
    expect(canWrite(access)).toBe(false);
  });

  it('ainda não bloqueia no último instante da tolerância', () => {
    // A borda importa: bloquear cedo demais tira a clínica do ar com o
    // pagamento ainda dentro do prazo combinado.
    const end = new Date(NOW.getTime() - GRACE_DAYS * DAY + 60_000);
    const access = resolveAccess(snapshot({ currentPeriodEnd: end }), NOW);
    expect(access.level).toBe('full');
    expect(access.status).toBe('PAST_DUE');
  });

  it('respeita uma tolerância negociada maior que a padrão', () => {
    const access = resolveAccess(
      snapshot({ currentPeriodEnd: at(-10), graceEndsAt: at(5) }),
      NOW,
    );
    expect(access.level).toBe('full');
    expect(access.daysLeft).toBe(5);
  });

  it('ignora o status gravado e decide pelas datas', () => {
    // O caso que motivou a função ser pura: ninguém rodou o cron, a linha
    // continua ACTIVE, e o vencimento passou faz tempo.
    const access = resolveAccess(snapshot({ status: 'ACTIVE', currentPeriodEnd: at(-60) }), NOW);
    expect(access.level).toBe('readonly');
    expect(access.status).toBe('SUSPENDED');
  });

  it('preserva a consulta aos dados após o cancelamento', () => {
    const access = resolveAccess(snapshot({ status: 'CANCELLED', cancelledAt: at(-1) }), NOW);
    expect(access.level).toBe('readonly');
    expect(access.warning).toContain('disponíveis');
  });

  it('trata cancelamento pela data mesmo com status desatualizado', () => {
    const access = resolveAccess(snapshot({ status: 'ACTIVE', cancelledAt: at(-1) }), NOW);
    expect(access.status).toBe('CANCELLED');
  });

  it('clínica sem plano nenhum não escreve', () => {
    expect(canWrite(NO_SUBSCRIPTION)).toBe(false);
  });
});
