import { describe, it, expect } from 'vitest';
import { valorPorExtenso } from './extenso';

describe('valorPorExtenso', () => {
  it('singular vs plural reais', () => {
    expect(valorPorExtenso(1)).toBe('um real');
    expect(valorPorExtenso(2)).toBe('dois reais');
  });

  it('centavos', () => {
    expect(valorPorExtenso(0.5)).toBe('zero reais e cinquenta centavos');
    expect(valorPorExtenso(1.01)).toBe('um real e um centavo');
  });

  it('cem exato', () => {
    expect(valorPorExtenso(100)).toBe('cem reais');
  });

  it('centenas com "e"', () => {
    expect(valorPorExtenso(550)).toBe('quinhentos e cinquenta reais');
  });

  it('milhar sem "e" antes de centena composta', () => {
    expect(valorPorExtenso(1234.5)).toBe('mil duzentos e trinta e quatro reais e cinquenta centavos');
  });

  it('milhar com "e" antes de centena redonda ou dezena', () => {
    expect(valorPorExtenso(1200)).toBe('mil e duzentos reais');
    expect(valorPorExtenso(1050)).toBe('mil e cinquenta reais');
  });

  it('rounds floating-point cents cleanly', () => {
    // 0.1 + 0.2 === 0.30000000000000004
    expect(valorPorExtenso(0.1 + 0.2)).toBe('zero reais e trinta centavos');
  });
});
