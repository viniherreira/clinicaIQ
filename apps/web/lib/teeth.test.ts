import { describe, expect, it } from 'vitest';
import { parseTeeth, teethLabel, toothName } from './teeth';

describe('dentes (FDI)', () => {
  it('texto do item, em ordem e sem repetir', () => {
    expect(teethLabel([21, 11])).toBe('Dentes 11 e 21');
    expect(teethLabel([36, 11, 21, 11])).toBe('Dentes 11, 21 e 36');
    expect(teethLabel([46])).toBe('Dente 46');
    expect(teethLabel([])).toBe('');
    expect(teethLabel([19, 50])).toBe('');
  });

  it('lê de volta só o que é lista de dentes', () => {
    expect(parseTeeth('Dentes 11, 21 e 36')).toEqual([11, 21, 36]);
    expect(parseTeeth('Dente 46')).toEqual([46]);
    expect(parseTeeth('Arcada superior')).toEqual([]);
    expect(parseTeeth('Dentes 11 e 99')).toEqual([]);
  });

  it('nome do dente', () => {
    expect(toothName(11)).toBe('11 — incisivo central superior direito');
    expect(toothName(36)).toBe('36 — 1º molar inferior esquerdo');
  });
});
