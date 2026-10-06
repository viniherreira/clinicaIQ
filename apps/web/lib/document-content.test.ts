import { describe, expect, it } from 'vitest';
import { contractGaps, contractTitle, formatPhoneBR, isMinor, maritalStatusText } from './document-content';

describe('contractTitle', () => {
  it('odontológico só com registro de dentista', () => {
    expect(contractTitle('CRO-SP 12345')).toBe('Contrato de prestação de serviços odontológicos');
    expect(contractTitle('cro/rj 9988')).toBe('Contrato de prestação de serviços odontológicos');
  });

  it('genérico para outros conselhos ou sem registro', () => {
    expect(contractTitle('CRM-SP 5555')).toBe('Contrato de prestação de serviços');
    expect(contractTitle(null)).toBe('Contrato de prestação de serviços');
    // "CROMO" não é "CRO".
    expect(contractTitle('CROMO 1')).toBe('Contrato de prestação de serviços');
  });
});

describe('isMinor', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  it('faz 18 hoje: já é maior', () => {
    expect(isMinor(new Date('2008-10-03T00:00:00Z'), now)).toBe(false);
  });
  it('faz 18 amanhã: ainda é menor', () => {
    expect(isMinor(new Date('2008-10-04T00:00:00Z'), now)).toBe(true);
  });
  it('sem data não presume menoridade', () => {
    expect(isMinor(null, now)).toBe(false);
  });
});

describe('formatPhoneBR', () => {
  it('formata dígitos crus e tira o 55', () => {
    expect(formatPhoneBR('11999990000')).toBe('(11) 99999-0000');
    expect(formatPhoneBR('5511999990000')).toBe('(11) 99999-0000');
    expect(formatPhoneBR('1133334444')).toBe('(11) 3333-4444');
  });
  it('mantém o que já veio com máscara', () => {
    expect(formatPhoneBR('(11) 99999-0000')).toBe('(11) 99999-0000');
  });
});

describe('maritalStatusText', () => {
  it('traduz os códigos do cadastro', () => {
    expect(maritalStatusText('uniao')).toBe('em união estável');
    expect(maritalStatusText('')).toBeUndefined();
  });
});

describe('contractGaps', () => {
  const completo = {
    patientId: 'p1',
    clinic: { document: '1', address: 'Rua', city: 'São Paulo', technicalResponsible: 'Dra. X' },
    patient: { hasCpf: true, hasAddress: true },
  };

  it('nada a pedir quando está tudo preenchido', () => {
    expect(contractGaps(completo)).toEqual([]);
  });

  it('aponta cada falta para a tela onde se resolve', () => {
    const gaps = contractGaps({
      ...completo,
      clinic: { ...completo.clinic, technicalResponsible: null },
      patient: { hasCpf: false, hasAddress: true },
    });
    expect(gaps).toEqual([
      { label: 'CPF do paciente', href: '/pacientes/p1/editar' },
      { label: 'Responsável técnico', href: '/configuracoes#documentos' },
    ]);
  });
});
