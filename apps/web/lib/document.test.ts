import { describe, expect, it } from 'vitest';
import {
  documentError,
  documentKind,
  formatDocument,
  isValidCNPJ,
  isValidCPF,
  isValidDocument,
} from './document';

describe('CPF', () => {
  it('aceita um CPF válido', () => {
    expect(isValidCPF('249.715.637-92')).toBe(true);
    expect(isValidCPF('24971563792')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidCPF('24971563793')).toBe(false);
  });

  it('recusa todos os dígitos iguais', () => {
    // A aritmética do mod-11 aprova estes; nenhum existe de verdade.
    expect(isValidCPF('11111111111')).toBe(false);
    expect(isValidCPF('00000000000')).toBe(false);
  });

  it('recusa comprimento errado', () => {
    expect(isValidCPF('2497156379')).toBe(false);
  });
});

describe('CNPJ', () => {
  it('aceita o CNPJ real da clínica', () => {
    expect(isValidCNPJ('68.318.896/0001-95')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidCNPJ('68318896000196')).toBe(false);
  });

  it('recusa todos os dígitos iguais', () => {
    expect(isValidCNPJ('11111111111111')).toBe(false);
  });
});

describe('documentKind', () => {
  it('distingue pelo comprimento', () => {
    expect(documentKind('24971563792')).toBe('CPF');
    expect(documentKind('68318896000195')).toBe('CNPJ');
  });

  it('devolve null para documento inválido', () => {
    expect(documentKind('12345')).toBeNull();
    expect(documentKind('11111111111')).toBeNull();
  });

  it('aceita os dois formatos como documento válido', () => {
    expect(isValidDocument('249.715.637-92')).toBe(true);
    expect(isValidDocument('68.318.896/0001-95')).toBe(true);
  });
});

describe('formatDocument', () => {
  it('formata CPF e CNPJ', () => {
    expect(formatDocument('24971563792')).toBe('249.715.637-92');
    expect(formatDocument('68318896000195')).toBe('68.318.896/0001-95');
  });

  it('devolve o valor original quando não reconhece', () => {
    expect(formatDocument('123')).toBe('123');
  });
});

describe('documentError', () => {
  it('explica o que está errado, sem jargão', () => {
    expect(documentError('')).toContain('Informe');
    expect(documentError('123')).toContain('11 dígitos');
    expect(documentError('24971563793')).toContain('CPF inválido');
    expect(documentError('68318896000196')).toContain('CNPJ inválido');
  });

  it('não reclama de documento válido', () => {
    expect(documentError('24971563792')).toBeNull();
    expect(documentError('68.318.896/0001-95')).toBeNull();
  });
});
