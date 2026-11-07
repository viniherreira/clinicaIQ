import { describe, expect, it } from 'vitest';
import { DATA_ISO, diaDeParede, periodoReal, subtrairMeses } from './datas';

describe('datas do assistente', () => {
  it('aceita só AAAA-MM-DD', () => {
    expect(DATA_ISO.safeParse('2026-11-08').success).toBe(true);
    expect(DATA_ISO.safeParse('08/11/2026').success).toBe(false);
    expect(DATA_ISO.safeParse('amanhã').success).toBe(false);
    expect(DATA_ISO.safeParse('2026-02-30').success).toBe(false);
    expect(DATA_ISO.safeParse('2026-13-01').success).toBe(false);
    expect(DATA_ISO.safeParse('2028-02-29').success).toBe(true);
  });

  it('dia de parede: hora guardada em UTC, como a agenda', () => {
    const { inicio, fim } = diaDeParede('2026-11-08');
    expect(inicio.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-11-08T23:59:59.999Z');
  });

  it('período real: começa à meia-noite de Brasília e inclui o último dia', () => {
    const { gte, lt } = periodoReal('2026-10-01', '2026-10-31');
    expect(gte.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('subtrai meses sem estourar o fim do mês', () => {
    expect(subtrairMeses('2026-11-07', 6)).toBe('2026-05-07');
    expect(subtrairMeses('2026-03-31', 1)).toBe('2026-02-28');
  });
});
