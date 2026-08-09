import { describe, expect, it } from 'vitest';
import { composeAddress } from './address';

describe('composeAddress', () => {
  it('monta o endereço completo do jeito brasileiro', () => {
    expect(
      composeAddress({
        street: 'Rua das Flores',
        addressNumber: '123',
        complement: 'Sala 4',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100',
      }),
    ).toBe('Rua das Flores, 123 — Sala 4 · Centro · São Paulo/SP · CEP 01310-100');
  });

  it('não deixa pontuação órfã quando falta pedaço', () => {
    // O que isso trava: um endereço só com rua virando "Rua X, · · ·" no PDF
    // que o paciente recebe.
    expect(composeAddress({ street: 'Rua das Flores' })).toBe('Rua das Flores');
    expect(composeAddress({ city: 'Campinas', state: 'SP' })).toBe('Campinas/SP');
    expect(composeAddress({ zipCode: '13010-000' })).toBe('CEP 13010-000');
  });

  it('devolve nulo quando não há nada — e não string vazia', () => {
    // Nulo é o que a coluna guarda para "sem endereço"; string vazia faria o PDF
    // imprimir uma linha em branco no cabeçalho.
    expect(composeAddress({})).toBeNull();
    expect(composeAddress({ street: '', city: null, state: undefined })).toBeNull();
    expect(composeAddress({ street: '   ' })).toBeNull();
  });

  it('ignora espaço em volta dos campos', () => {
    expect(composeAddress({ street: '  Rua A  ', addressNumber: ' 10 ' })).toBe('Rua A, 10');
  });

  it('sem número, não sobra vírgula solta', () => {
    expect(composeAddress({ street: 'Avenida Brasil', neighborhood: 'Jardim' })).toBe(
      'Avenida Brasil · Jardim',
    );
  });

  it('cidade sem UF, e UF sem cidade, não viram barra solta', () => {
    expect(composeAddress({ city: 'Recife' })).toBe('Recife');
    expect(composeAddress({ state: 'PE' })).toBe('PE');
  });
});
