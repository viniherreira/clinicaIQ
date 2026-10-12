import { describe, expect, it } from 'vitest';
import {
  asPeriod,
  conversionRate,
  countBy,
  formatMinutes,
  medianFirstResponseMinutes,
  periodStart,
  type ResponseSample,
} from './dashboard-math';

const t = (iso: string) => new Date(iso);

describe('periodStart', () => {
  const now = t('2026-10-11T15:00:00Z');
  it.each([
    ['7d', '2026-10-04T15:00:00.000Z'],
    ['30d', '2026-09-11T15:00:00.000Z'],
    ['90d', '2026-07-13T15:00:00.000Z'],
    ['mes', '2026-10-01T03:00:00.000Z'],
  ] as const)('%s', (key, esperado) => {
    expect(periodStart(key, now).toISOString()).toBe(esperado);
  });

  it('"este mês" usa o dia da clínica: 1º de novembro às 01h em Brasília ainda é novembro', () => {
    expect(periodStart('mes', t('2026-11-01T04:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
    // 31/10 às 23h em Brasília (02h UTC do dia 1º): ainda é outubro.
    expect(periodStart('mes', t('2026-11-01T02:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });
});

describe('asPeriod', () => {
  it.each([
    ['7d', '7d'],
    ['mes', 'mes'],
    ['', '30d'],
    [undefined, '30d'],
    ['1ano', '30d'],
  ])('%s → %s', (v, esperado) => expect(asPeriod(v)).toBe(esperado));
});

describe('conversionRate', () => {
  it.each([
    [0, 0, null],
    [1, 0, 1],
    [1, 3, 0.25],
    [0, 4, 0],
  ])('%i ganhos, %i perdidos → %s', (w, l, esperado) => expect(conversionRate(w, l)).toBe(esperado));
});

describe('medianFirstResponseMinutes', () => {
  const msg = (conversationId: string, direction: 'INBOUND' | 'OUTBOUND', origin: string, at: string): ResponseSample => ({
    conversationId,
    direction,
    origin,
    at: t(at),
  });

  it('sem respostas de gente, não há tempo', () => {
    expect(medianFirstResponseMinutes([])).toBeNull();
    expect(
      medianFirstResponseMinutes([
        msg('a', 'INBOUND', 'CONTACT', '2026-10-01T10:00:00Z'),
        msg('a', 'OUTBOUND', 'BOT', '2026-10-01T10:00:05Z'),
      ]),
    ).toBeNull();
  });

  it('conta do primeiro oi até a primeira resposta da equipe, ignorando robô e automação', () => {
    expect(
      medianFirstResponseMinutes([
        msg('a', 'INBOUND', 'CONTACT', '2026-10-01T10:00:00Z'),
        msg('a', 'INBOUND', 'CONTACT', '2026-10-01T10:02:00Z'),
        msg('a', 'OUTBOUND', 'BOT', '2026-10-01T10:00:01Z'),
        msg('a', 'OUTBOUND', 'CRM', '2026-10-01T10:10:00Z'),
      ]),
    ).toBe(10);
  });

  it('a resposta pelo celular da clínica também conta; mediana entre conversas', () => {
    expect(
      medianFirstResponseMinutes([
        msg('a', 'INBOUND', 'CONTACT', '2026-10-01T10:00:00Z'),
        msg('a', 'OUTBOUND', 'PHONE', '2026-10-01T10:04:00Z'),
        msg('b', 'INBOUND', 'CONTACT', '2026-10-01T11:00:00Z'),
        msg('b', 'OUTBOUND', 'CRM', '2026-10-01T11:30:00Z'),
        msg('c', 'INBOUND', 'CONTACT', '2026-10-01T12:00:00Z'),
        msg('c', 'OUTBOUND', 'CRM', '2026-10-03T12:00:00Z'),
      ]),
    ).toBe(30);
  });

  it('cada nova pergunta depois de uma resposta abre outra espera', () => {
    expect(
      medianFirstResponseMinutes([
        msg('a', 'INBOUND', 'CONTACT', '2026-10-01T10:00:00Z'),
        msg('a', 'OUTBOUND', 'CRM', '2026-10-01T10:02:00Z'),
        msg('a', 'INBOUND', 'CONTACT', '2026-10-01T11:00:00Z'),
        msg('a', 'OUTBOUND', 'CRM', '2026-10-01T11:04:00Z'),
      ]),
    ).toBe(3);
  });
});

describe('formatMinutes', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [125, '2 h 05'],
    [1440, '1 dia'],
    [4000, '3 dias'],
  ])('%i → %s', (m, esperado) => expect(formatMinutes(m)).toBe(esperado));
});

describe('countBy', () => {
  it('do maior para o menor, empate em ordem alfabética', () => {
    expect(countBy(['b', 'a', 'b', 'c', 'a', 'b'], (x) => x)).toEqual([
      { key: 'b', count: 3 },
      { key: 'a', count: 2 },
      { key: 'c', count: 1 },
    ]);
  });
});
