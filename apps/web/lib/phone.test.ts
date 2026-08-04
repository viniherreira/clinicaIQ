import { describe, it, expect } from 'vitest';
import { normalizeBrazilPhone } from './phone';

describe('normalizeBrazilPhone', () => {
  it('adds the country code to local numbers', () => {
    expect(normalizeBrazilPhone('11 98765-4321')).toBe('5511987654321');
    expect(normalizeBrazilPhone('(11) 3456-7890')).toBe('551134567890');
  });

  it('leaves numbers that already carry the country code alone', () => {
    expect(normalizeBrazilPhone('+55 11 98765-4321')).toBe('5511987654321');
    expect(normalizeBrazilPhone('55 11 3456-7890')).toBe('551134567890');
  });

  it('handles DDD 55 without mistaking it for the country code', () => {
    // Santa Maria/RS. The old prefix test saw the leading "55", assumed the
    // country code was already there, and shipped an 11-digit number that
    // WhatsApp read as country 55 + DDD 99 — the whole region was unreachable.
    expect(normalizeBrazilPhone('55 99999-8888')).toBe('5555999998888');
    expect(normalizeBrazilPhone('(55) 3220-1234')).toBe('555532201234');
    expect(normalizeBrazilPhone('+55 55 99999-8888')).toBe('5555999998888');
  });

  it('strips the trunk prefix people type out of habit', () => {
    expect(normalizeBrazilPhone('(011) 98765-4321')).toBe('5511987654321');
    expect(normalizeBrazilPhone('0 11 98765 4321')).toBe('5511987654321');
  });

  it('returns malformed input digits-only instead of inventing a country code', () => {
    // Too short to be a Brazilian line: better that the server lookup rejects it
    // explicitly than that we pad it into something that resolves to a stranger.
    expect(normalizeBrazilPhone('99999')).toBe('99999');
    expect(normalizeBrazilPhone('')).toBe('');
    expect(normalizeBrazilPhone('abc')).toBe('');
  });

  it('is idempotent', () => {
    for (const raw of ['11 98765-4321', '55 99999-8888', '(011) 3456-7890']) {
      const once = normalizeBrazilPhone(raw);
      expect(normalizeBrazilPhone(once)).toBe(once);
    }
  });
});
