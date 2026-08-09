import { describe, expect, it } from 'vitest';
import { can, capabilityDeniedMessage, isRole, LEAST_PRIVILEGE, type Capability } from './permissions';

const TODAS: Capability[] = [
  'agenda',
  'pacientes',
  'prontuario',
  'financeiro',
  'configuracoes',
  'planos',
  'campanhas',
];

describe('can', () => {
  it('dono e admin alcançam tudo', () => {
    for (const cap of TODAS) {
      expect(can('OWNER', cap)).toBe(true);
      expect(can('ADMIN', cap)).toBe(true);
    }
  });

  it('recepcionista marca consulta e recebe pagamento', () => {
    expect(can('RECEPTIONIST', 'agenda')).toBe(true);
    expect(can('RECEPTIONIST', 'pacientes')).toBe(true);
    expect(can('RECEPTIONIST', 'financeiro')).toBe(true);
  });

  it('recepcionista não abre prontuário', () => {
    // Histórico de saúde não é necessário para agendar, e é dado sensível
    // (LGPD art. 11). Acesso mínimo.
    expect(can('RECEPTIONIST', 'prontuario')).toBe(false);
  });

  it('recepcionista não mexe em configuração nem no plano', () => {
    expect(can('RECEPTIONIST', 'configuracoes')).toBe(false);
    expect(can('RECEPTIONIST', 'planos')).toBe(false);
  });

  it('profissional atende: agenda e prontuário sim, dinheiro não', () => {
    expect(can('PROFESSIONAL', 'agenda')).toBe(true);
    expect(can('PROFESSIONAL', 'prontuario')).toBe(true);
    expect(can('PROFESSIONAL', 'financeiro')).toBe(false);
    expect(can('PROFESSIONAL', 'planos')).toBe(false);
    expect(can('PROFESSIONAL', 'configuracoes')).toBe(false);
  });

  it('só dono e admin tocam no plano', () => {
    const podem = (['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'] as const).filter((r) =>
      can(r, 'planos'),
    );
    expect(podem).toEqual(['OWNER', 'ADMIN']);
  });

  it('papel desconhecido cai no menor privilégio, não no maior', () => {
    // O que isso trava: um valor novo no enum, ou uma consulta que falhou e
    // devolveu null, não pode virar acesso total por acidente.
    expect(can(null, 'prontuario')).toBe(can(LEAST_PRIVILEGE, 'prontuario'));
    expect(can(undefined, 'configuracoes')).toBe(false);
    expect(can('SUPERUSUARIO', 'planos')).toBe(false);
    expect(can('', 'financeiro')).toBe(false);
  });

  it('todo papel enxerga a agenda — é o mínimo para trabalhar', () => {
    for (const r of ['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'] as const) {
      expect(can(r, 'agenda')).toBe(true);
    }
  });
});

describe('isRole', () => {
  it('reconhece os quatro do schema', () => {
    for (const r of ['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL']) {
      expect(isRole(r)).toBe(true);
    }
  });

  it('recusa qualquer outra coisa', () => {
    expect(isRole('owner')).toBe(false); // sensível a maiúscula, como o enum
    expect(isRole(null)).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});

describe('capabilityDeniedMessage', () => {
  it('diz o que fazer, não só que não pode', () => {
    const msg = capabilityDeniedMessage('prontuario');
    expect(msg).toContain('prontuário');
    expect(msg).toContain('responsável pela clínica');
  });

  it('tem texto para toda capacidade', () => {
    for (const cap of TODAS) {
      expect(capabilityDeniedMessage(cap).length).toBeGreaterThan(20);
    }
  });
});
