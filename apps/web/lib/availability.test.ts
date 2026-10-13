import { describe, expect, it } from 'vitest';
import { clinicNow, freeSlots, readOnlineBooking, ONLINE_BOOKING_DEFAULTS } from './availability';

const dia = { start: '08:00', end: '12:00', lunchStart: null, lunchEnd: null };
const h = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

describe('freeSlots', () => {
  it('dia livre: de meia em meia hora até caber a consulta inteira', () => {
    expect(freeSlots({ day: dia, busy: [], durationMin: 60, stepMin: 30 })).toEqual([
      '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00',
    ]);
  });

  it('fechado ou expediente inválido não oferece nada', () => {
    expect(freeSlots({ day: null, busy: [], durationMin: 30, stepMin: 30 })).toEqual([]);
    expect(freeSlots({ day: { start: '10:00', end: '09:00' }, busy: [], durationMin: 30, stepMin: 30 })).toEqual([]);
  });

  it('pula o que encosta em agendamento, bloqueio ou almoço', () => {
    const r = freeSlots({
      day: { start: '08:00', end: '14:00', lunchStart: '12:00', lunchEnd: '13:00' },
      busy: [[h('09:00'), h('09:45')]],
      durationMin: 30,
      stepMin: 30,
    });
    expect(r).toEqual(['08:00', '08:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30']);
  });

  it('respeita a antecedência mínima de hoje', () => {
    expect(freeSlots({ day: dia, busy: [], durationMin: 30, stepMin: 30, notBeforeMin: h('10:10') })).toEqual([
      '10:30', '11:00', '11:30',
    ]);
  });
});

describe('clinicNow', () => {
  it('lê o relógio de Brasília (UTC−3)', () => {
    expect(clinicNow(new Date('2026-10-12T02:30:00Z'))).toEqual({ date: '2026-10-11', minutes: 23 * 60 + 30 });
    expect(clinicNow(new Date('2026-10-12T13:05:00Z'))).toEqual({ date: '2026-10-12', minutes: 10 * 60 + 5 });
  });
});

describe('readOnlineBooking', () => {
  it('sem nada configurado: desligado, com os padrões', () => {
    expect(readOnlineBooking(null)).toEqual(ONLINE_BOOKING_DEFAULTS);
    expect(readOnlineBooking({ businessHours: [] })).toEqual(ONLINE_BOOKING_DEFAULTS);
  });

  it('corrige valores fora do lugar', () => {
    const r = readOnlineBooking({
      onlineBooking: { enabled: true, minAdvanceHours: 500, maxDaysAhead: 0, stepMinutes: 7, professionalIds: ['a', 3], procedureIds: 'x' },
    });
    expect(r).toMatchObject({ enabled: true, minAdvanceHours: 72, maxDaysAhead: 1, stepMinutes: 30, professionalIds: ['a'], procedureIds: [] });
  });
});
