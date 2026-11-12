import { describe, expect, it } from 'vitest';
import { bestIndex, buildArrivals, firstResponseWaits, lastMonths, median, monthLabel, peakText, responseMedians, type PersonSample } from './performance-rules';

const msg = (conversationId: string, min: number, direction: 'INBOUND' | 'OUTBOUND', origin: string, sentById: string | null = null): PersonSample => ({
  conversationId,
  direction,
  origin,
  sentById,
  at: new Date(Date.UTC(2026, 10, 10, 12, min)),
});

describe('tempo da primeira resposta por pessoa', () => {
  const amostras = [
    // Conversa 1: a Ana responde em 4 min; o robô antes não conta.
    msg('c1', 0, 'INBOUND', 'CONTACT'),
    msg('c1', 1, 'OUTBOUND', 'BOT'),
    msg('c1', 4, 'OUTBOUND', 'CRM', 'ana'),
    // Depois a pessoa escreve de novo e a Bia responde em 10 min.
    msg('c1', 20, 'INBOUND', 'CONTACT'),
    msg('c1', 30, 'OUTBOUND', 'CRM', 'bia'),
    // Conversa 2: respondida pelo celular da clínica (sem pessoa) em 8 min.
    msg('c2', 0, 'INBOUND', 'CONTACT'),
    msg('c2', 2, 'INBOUND', 'CONTACT'),
    msg('c2', 8, 'OUTBOUND', 'PHONE'),
    // Conversa 3: ninguém respondeu ainda.
    msg('c3', 0, 'INBOUND', 'CONTACT'),
  ];

  it('conta do primeiro "oi" até a resposta de gente, e diz quem respondeu', () => {
    expect(firstResponseWaits(amostras).sort((a, b) => a.minutes - b.minutes)).toEqual([
      { minutes: 4, by: 'ana' },
      { minutes: 8, by: null },
      { minutes: 10, by: 'bia' },
    ]);
  });

  it('mediana geral e por pessoa', () => {
    const r = responseMedians(amostras);
    expect(r.all).toBe(8);
    expect(Object.fromEntries(r.byPerson)).toEqual({ ana: 4, bia: 10 });
    expect(responseMedians([]).all).toBeNull();
    expect(median([1, 2, 3, 10])).toBe(3);
  });
});

describe('quando os leads chegam', () => {
  it('monta a grade, soma por dia e por semana do mês, e acha o pico', () => {
    const a = buildArrivals([
      { dow: 1, hour: 9, week: 1, n: 3 },
      { dow: 1, hour: 9, week: 2, n: 2 },
      { dow: 4, hour: 19, week: 5, n: 4 },
      { dow: 7, hour: 23, week: 3, n: 1 },
      // Linhas impossíveis não derrubam nada.
      { dow: 9, hour: 3, week: 1, n: 5 },
      { dow: 2, hour: 30, week: 1, n: 5 },
    ]);
    expect(a.grid[0][9]).toBe(5);
    expect(a.grid[3][19]).toBe(4);
    expect(a.byWeekday).toEqual([5, 0, 0, 4, 0, 0, 1]);
    expect(a.byWeekOfMonth).toEqual([3, 2, 1, 0, 4]);
    expect(a.total).toBe(10);
    expect(a.peak).toEqual({ day: 0, hour: 9, n: 5 });
    // Por hora do dia e os horários mais cheios, em ordem.
    expect(a.byHour[9]).toBe(5);
    expect(a.byHour[19]).toBe(4);
    expect(a.top.map((t) => [t.day, t.hour, t.n])).toEqual([
      [0, 9, 5],
      [3, 19, 4],
      [6, 23, 1],
    ]);
    expect(bestIndex(a.byWeekOfMonth)).toBe(4);
    expect(bestIndex([0, 0])).toBeNull();
    expect(peakText(a.peak!)).toBe('Segunda, das 9h às 10h');
    expect(buildArrivals([]).peak).toBeNull();
  });

  it('os últimos meses, virando o ano', () => {
    expect(lastMonths('2026-02-11', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthLabel('2026-02')).toEqual({ tick: 'fev', label: 'fev/26' });
  });
});
