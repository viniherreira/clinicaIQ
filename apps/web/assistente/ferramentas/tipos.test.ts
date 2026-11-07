import { describe, expect, it } from 'vitest';
import { limitar, reais, LIMITE_LINHAS } from './tipos';

describe('limitar', () => {
  it('devolve tudo quando cabe', () => {
    expect(limitar([1, 2, 3])).toEqual({ itens: [1, 2, 3], total: 3, cortado: false });
  });
  it('corta em 50 e avisa', () => {
    const r = limitar(Array.from({ length: 70 }, (_, i) => i));
    expect(r.itens).toHaveLength(LIMITE_LINHAS);
    expect(r).toMatchObject({ total: 70, cortado: true });
  });
});

describe('reais', () => {
  it('formata centavos em BRL', () => {
    expect(reais(123456)).toBe('R$ 1.234,56');
  });
});
