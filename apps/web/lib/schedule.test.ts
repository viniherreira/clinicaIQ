import { describe, it, expect } from 'vitest';
import { timeToMin, nonWorkingIntervals, isWithinWorkingHours } from './schedule';

const GRID_START = 7 * 60; // 420
const GRID_END = 21 * 60; // 1260

describe('timeToMin', () => {
  it('parses HH:mm', () => {
    expect(timeToMin('08:30')).toBe(510);
    expect(timeToMin('00:00')).toBe(0);
    expect(timeToMin('21:00')).toBe(1260);
  });
  it('returns null for empty/malformed', () => {
    expect(timeToMin('')).toBeNull();
    expect(timeToMin(null)).toBeNull();
    expect(timeToMin('banana')).toBeNull();
  });
});

describe('nonWorkingIntervals', () => {
  it('dims the whole grid when closed', () => {
    expect(nonWorkingIntervals(null, GRID_START, GRID_END)).toEqual([[GRID_START, GRID_END]]);
  });

  it('dims before start and after end', () => {
    const day = { start: '08:00', end: '18:00' };
    expect(nonWorkingIntervals(day, GRID_START, GRID_END)).toEqual([
      [420, 480],
      [1080, 1260],
    ]);
  });

  it('adds the lunch break', () => {
    const day = { start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' };
    expect(nonWorkingIntervals(day, GRID_START, GRID_END)).toEqual([
      [420, 480],
      [1080, 1260],
      [720, 780],
    ]);
  });

  it('returns nothing when the day spans the whole grid', () => {
    const day = { start: '07:00', end: '21:00' };
    expect(nonWorkingIntervals(day, GRID_START, GRID_END)).toEqual([]);
  });
});

describe('isWithinWorkingHours', () => {
  const day = { start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' };

  it('accepts a slot inside the working day', () => {
    expect(isWithinWorkingHours(day, 9 * 60, 10 * 60)).toBe(true);
  });
  it('rejects slots before start or after end', () => {
    expect(isWithinWorkingHours(day, 7 * 60, 8 * 60)).toBe(false);
    expect(isWithinWorkingHours(day, 18 * 60, 19 * 60)).toBe(false);
  });
  it('rejects slots overlapping lunch', () => {
    expect(isWithinWorkingHours(day, 12 * 60 + 30, 13 * 60 + 30)).toBe(false);
  });
  it('always rejects when the day is closed', () => {
    expect(isWithinWorkingHours(null, 9 * 60, 10 * 60)).toBe(false);
  });
});
