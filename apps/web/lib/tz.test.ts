import { describe, it, expect, afterEach, vi } from 'vitest';
import { clinicToday, wallClockTime, wallClockMinutes } from './tz';

describe('wallClockTime', () => {
  it('reads the wall-clock from UTC components, not local tz', () => {
    expect(wallClockTime(new Date('2026-07-06T14:00:00.000Z'))).toBe('14:00');
    expect(wallClockTime(new Date('2026-07-06T09:05:00.000Z'))).toBe('09:05');
    expect(wallClockTime('2026-07-06T23:30:00.000Z')).toBe('23:30');
  });
});

describe('wallClockMinutes', () => {
  it('returns minutes since midnight from UTC components', () => {
    expect(wallClockMinutes(new Date('2026-07-06T14:30:00.000Z'))).toBe(870);
    expect(wallClockMinutes(new Date('2026-07-06T00:00:00.000Z'))).toBe(0);
  });
});

describe('clinicToday', () => {
  afterEach(() => vi.useRealTimers());

  it('uses the São Paulo date even late at night in UTC', () => {
    // 02:00 UTC on the 7th is still 23:00 on the 6th in São Paulo (UTC-3)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T02:00:00.000Z'));
    expect(clinicToday()).toBe('2026-07-06');
  });

  it('rolls to the next day once São Paulo passes midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));
    expect(clinicToday()).toBe('2026-07-07');
  });
});
