import { describe, expect, it } from 'vitest';
import { AGENDA_DEFAULTS, makeGrid, readAgendaRules } from './agenda-rules';

describe('regras da agenda', () => {
  it('sem nada salvo: o padrão (a agenda de sempre)', () => {
    expect(readAgendaRules(null)).toEqual(AGENDA_DEFAULTS);
    expect(readAgendaRules({ agenda: 'x' })).toEqual(AGENDA_DEFAULTS);
  });

  it('lê o que a clínica escolheu e corrige o que não faz sentido', () => {
    expect(readAgendaRules({ agenda: { slotMinutes: 15, startHour: 6, endHour: 22, defaultDurationMinutes: 45, allowOverlap: true } })).toEqual({
      slotMinutes: 15,
      startHour: 6,
      endHour: 22,
      defaultDurationMinutes: 45,
      allowOverlap: true,
    });
    const torto = readAgendaRules({ agenda: { slotMinutes: 7, startHour: -3, endHour: 99, defaultDurationMinutes: 1000, allowOverlap: 'sim' } });
    expect(torto).toEqual({ slotMinutes: 10, startHour: 0, endHour: 24, defaultDurationMinutes: 240, allowOverlap: false });
  });

  it('a grade padrão tem a mesma geometria de antes (16 px a cada 10 min)', () => {
    const g = makeGrid(AGENDA_DEFAULTS);
    expect(g.slotHeight).toBe(16);
    expect(g.totalHeight).toBe(14 * 96);
    expect(g.minToPx(7 * 60)).toBe(0);
    expect(g.minToPx(8 * 60 + 30)).toBe(144);
  });

  it('intervalo de 15 min: a hora continua com a mesma altura', () => {
    const g = makeGrid({ startHour: 8, endHour: 18, slotMinutes: 15 });
    expect(g.slotHeight).toBe(24);
    expect(g.totalHeight).toBe(960);
  });
});
