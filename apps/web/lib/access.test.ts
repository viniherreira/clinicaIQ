import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRACE_DAYS } from './subscription';

vi.mock('server-only', () => ({}));

// `cache` do React devolve a própria função fora do request do Next.
vi.mock('react', () => ({ cache: <T,>(fn: T) => fn }));

let assinatura: Record<string, unknown> | null = null;
const findUnique = vi.fn(async () => assinatura);

vi.mock('@clinicaiq/db', () => ({
  prisma: { subscription: { findUnique: (...a: unknown[]) => findUnique(...(a as [])) } },
}));

const { writeBlocked, canWriteTenant } = await import('./access');

const DIA = 24 * 60 * 60 * 1000;
const daqui = (dias: number) => new Date(Date.now() + dias * DIA);

beforeEach(() => {
  assinatura = null;
  findUnique.mockClear();
});

describe('writeBlocked', () => {
  it('libera clínica em dia', async () => {
    assinatura = {
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodEnd: daqui(20),
      graceEndsAt: null,
      cancelledAt: null,
    };
    expect(await writeBlocked('t1')).toBeNull();
    expect(await canWriteTenant('t1')).toBe(true);
  });

  it('libera durante o teste', async () => {
    assinatura = {
      status: 'TRIALING',
      trialEndsAt: daqui(10),
      currentPeriodEnd: daqui(10),
      graceEndsAt: null,
      cancelledAt: null,
    };
    expect(await writeBlocked('t1')).toBeNull();
  });

  it('libera dentro da tolerância, mesmo com o pagamento atrasado', async () => {
    // A clínica com a agenda cheia não pode perder o sistema no meio da manhã
    // por um boleto de ontem.
    assinatura = {
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodEnd: daqui(-2),
      graceEndsAt: null,
      cancelledAt: null,
    };
    expect(await writeBlocked('t1')).toBeNull();
  });

  it('bloqueia depois que a tolerância acaba', async () => {
    assinatura = {
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodEnd: daqui(-(GRACE_DAYS + 1)),
      graceEndsAt: null,
      cancelledAt: null,
    };
    const msg = await writeBlocked('t1');
    expect(msg).toBeTruthy();
    expect(msg).toContain('pagamento');
    expect(await canWriteTenant('t1')).toBe(false);
  });

  it('bloqueia quando o teste venceu e a tolerância passou', async () => {
    assinatura = {
      status: 'TRIALING',
      trialEndsAt: daqui(-(GRACE_DAYS + 1)),
      currentPeriodEnd: daqui(-(GRACE_DAYS + 1)),
      graceEndsAt: null,
      cancelledAt: null,
    };
    expect(await writeBlocked('t1')).toBeTruthy();
  });

  it('bloqueia clínica sem assinatura nenhuma', async () => {
    assinatura = null;
    expect(await writeBlocked('t1')).toBeTruthy();
  });

  it('bloqueia assinatura cancelada', async () => {
    assinatura = {
      status: 'CANCELLED',
      trialEndsAt: null,
      currentPeriodEnd: daqui(30),
      graceEndsAt: null,
      cancelledAt: daqui(-1),
    };
    expect(await writeBlocked('t1')).toBeTruthy();
  });

  it('sempre devolve uma mensagem quando bloqueia, nunca string vazia', async () => {
    assinatura = null;
    const msg = await writeBlocked('t1');
    expect(typeof msg).toBe('string');
    expect((msg ?? '').length).toBeGreaterThan(10);
  });

  it('decide pelas datas, não pelo status gravado', async () => {
    // O status na tabela é conveniência. Se o cron não rodou, uma linha pode
    // dizer ACTIVE meses depois do vencimento — e não pode virar acesso grátis.
    assinatura = {
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodEnd: daqui(-120),
      graceEndsAt: null,
      cancelledAt: null,
    };
    expect(await writeBlocked('t1')).toBeTruthy();
  });
});
