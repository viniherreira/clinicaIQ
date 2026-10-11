import { describe, expect, it } from 'vitest';
import {
  crmStatus,
  seatsCharged,
  subscriptionDescription,
  subscriptionValueCents,
  trialAvailable,
  trialDaysLeft,
} from './billing';

const agora = new Date('2026-10-09T12:00:00Z');
const emDias = (d: number) => new Date(agora.getTime() + d * 86_400_000);

describe('crmStatus', () => {
  it.each([
    ['desligado', { crmEnabled: false, crmTrialEndsAt: emDias(5), complimentary: false }, 'off'],
    ['em teste', { crmEnabled: true, crmTrialEndsAt: emDias(5), complimentary: false }, 'trial'],
    ['teste acabou', { crmEnabled: true, crmTrialEndsAt: emDias(-1), complimentary: false }, 'paid'],
    ['ativado sem teste', { crmEnabled: true, crmTrialEndsAt: null, complimentary: false }, 'paid'],
    ['cortesia, mesmo em teste', { crmEnabled: true, crmTrialEndsAt: emDias(5), complimentary: true }, 'complimentary'],
    ['cortesia, mesmo sem ter ligado', { crmEnabled: false, crmTrialEndsAt: null, complimentary: true }, 'complimentary'],
  ] as const)('%s', (_, sub, esperado) => {
    expect(crmStatus(sub, agora)).toBe(esperado);
  });

  it('sem assinatura, desligado', () => {
    expect(crmStatus(null, agora)).toBe('off');
  });
});

describe('teste grátis', () => {
  it('só uma vez por clínica', () => {
    expect(trialAvailable({ crmTrialEndsAt: null })).toBe(true);
    expect(trialAvailable({ crmTrialEndsAt: emDias(-30) })).toBe(false);
  });

  it('dias que faltam, arredondando para cima', () => {
    expect(trialDaysLeft({ crmEnabled: true, crmTrialEndsAt: emDias(2.2), complimentary: false }, agora)).toBe(3);
    expect(trialDaysLeft({ crmEnabled: true, crmTrialEndsAt: emDias(-1), complimentary: false }, agora)).toBeNull();
  });
});

describe('seatsCharged', () => {
  it('conta só quem está ativo, com a chave ligada e perfil elegível', () => {
    expect(
      seatsCharged([
        { active: true, crmSeat: true, role: 'OWNER' },
        { active: true, crmSeat: true, role: 'RECEPTIONIST' },
        { active: true, crmSeat: false, role: 'RECEPTIONIST' },
        { active: false, crmSeat: true, role: 'ADMIN' },
        { active: true, crmSeat: true, role: 'PROFESSIONAL' },
      ]),
    ).toBe(2);
  });
});

describe('subscriptionValueCents', () => {
  const base = { planPriceCents: 19_700, seatPriceCents: 3_900, seats: 2 };

  it('pago: plano + R$ 39 por usuário', () => {
    expect(subscriptionValueCents({ ...base, status: 'paid' })).toBe(27_500);
  });

  it('em teste, cortesia ou desligado: só o plano', () => {
    for (const status of ['trial', 'complimentary', 'off'] as const) {
      expect(subscriptionValueCents({ ...base, status })).toBe(19_700);
    }
  });

  it('pago sem ninguém com acesso: só o plano', () => {
    expect(subscriptionValueCents({ ...base, seats: 0, status: 'paid' })).toBe(19_700);
  });
});

describe('subscriptionDescription', () => {
  it('a fatura diz o que está sendo cobrado', () => {
    expect(subscriptionDescription('Profissional', 'paid', 2)).toBe('ClinicaIQ — plano Profissional + CRM (2 usuários)');
    expect(subscriptionDescription('Essencial', 'paid', 1)).toBe('ClinicaIQ — plano Essencial + CRM (1 usuário)');
    expect(subscriptionDescription('Clínica', 'trial', 3)).toBe('ClinicaIQ — plano Clínica');
  });
});
