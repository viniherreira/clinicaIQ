import { describe, expect, it } from 'vitest';
import { faceLetter, faceName, facesText, findingText, toothGone, toothName, toothVisual, VALID_TEETH } from './odontogram';

describe('dentes', () => {
  it('permanentes e decíduos válidos', () => {
    expect(VALID_TEETH.size).toBe(32 + 20);
    expect(VALID_TEETH.has(18)).toBe(true);
    expect(VALID_TEETH.has(56)).toBe(false);
    expect(VALID_TEETH.has(85)).toBe(true);
  });

  it.each([
    [36, '1º molar inferior esquerdo'],
    [11, 'Incisivo central superior direito'],
    [48, '3º molar (siso) inferior direito'],
    [63, 'Canino superior esquerdo (decíduo)'],
    [85, '2º molar inferior direito (decíduo)'],
  ])('%i → %s', (n, nome) => expect(toothName(n)).toBe(nome));
});

describe('faces', () => {
  it('oclusal no posterior, incisal no anterior; palatina em cima, lingual embaixo', () => {
    expect(faceName('O', 36)).toBe('Oclusal');
    expect(faceName('O', 11)).toBe('Incisal');
    expect(faceName('L', 16)).toBe('Palatina');
    expect(faceName('L', 46)).toBe('Lingual');
    expect(faceLetter('O', 21)).toBe('I');
    expect(faceLetter('L', 26)).toBe('P');
  });

  it('escreve na ordem da ficha', () => {
    expect(facesText(['D', 'O', 'M'], 36)).toBe('MOD');
    expect(facesText(['V', 'O'], 11)).toBe('IV');
    expect(facesText([], 36)).toBe('');
  });

  it('texto da marcação', () => {
    expect(findingText({ toothNumber: 36, kind: 'RESTORATION', surfaces: ['O', 'M'] })).toBe('Restauração MO no dente 36');
    expect(findingText({ toothNumber: 46, kind: 'IMPLANT', surfaces: [] })).toBe('Implante no dente 46');
  });
});

describe('como desenhar o dente', () => {
  it('a face fica com a situação mais urgente', () => {
    const v = toothVisual([
      { toothNumber: 36, kind: 'RESTORATION', surfaces: ['O', 'D'], status: 'DONE' },
      { toothNumber: 36, kind: 'CARIES', surfaces: ['O'], status: 'PLANNED' },
      { toothNumber: 36, kind: 'ROOT_CANAL', surfaces: [], status: 'DONE' },
    ]);
    expect(v.faces).toEqual({ O: 'PLANNED', D: 'DONE' });
    expect(v.whole).toEqual({ ROOT_CANAL: 'DONE' });
    expect(v.top).toBe('PLANNED');
    expect(v.count).toBe(3);
  });

  it('extraído ou ausente sai da boca; extração a fazer ainda não', () => {
    expect(toothGone(toothVisual([{ toothNumber: 18, kind: 'MISSING', surfaces: [], status: 'EXISTING' }]))).toBe(true);
    expect(toothGone(toothVisual([{ toothNumber: 18, kind: 'EXTRACTION', surfaces: [], status: 'DONE' }]))).toBe(true);
    expect(toothGone(toothVisual([{ toothNumber: 18, kind: 'EXTRACTION', surfaces: [], status: 'PLANNED' }]))).toBe(false);
  });
});
