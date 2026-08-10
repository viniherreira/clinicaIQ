import { describe, expect, it } from 'vitest';
import { can, capabilityDeniedMessage, isRole, LEAST_PRIVILEGE, type Capability } from './permissions';

const TODAS: Capability[] = [
  'agenda',
  'pacientes',
  'prontuario',
  'financeiro',
  'configuracoes',
  'campanhas',
  'equipe',
  'planos',
  'privacidade',
];

/** O que só o dono e o administrador alcançam. */
const SO_ADMIN: Capability[] = ['equipe', 'planos', 'privacidade'];
const PAPEIS = ['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'] as const;

describe('can', () => {
  it('dono e admin alcançam tudo', () => {
    for (const cap of TODAS) {
      expect(can('OWNER', cap)).toBe(true);
      expect(can('ADMIN', cap)).toBe(true);
    }
  });

  it('quem atende trabalha sem pedir licença', () => {
    // A clínica funciona junto: travar a recepção no meio do atendimento acaba
    // com o dono emprestando o login dele, que é pior do que não travar nada.
    for (const papel of ['RECEPTIONIST', 'PROFESSIONAL'] as const) {
      expect(can(papel, 'agenda')).toBe(true);
      expect(can(papel, 'pacientes')).toBe(true);
      expect(can(papel, 'prontuario')).toBe(true);
      expect(can(papel, 'financeiro')).toBe(true);
      expect(can(papel, 'configuracoes')).toBe(true);
      expect(can(papel, 'campanhas')).toBe(true);
    }
  });

  it('mexer em quem tem acesso é só do dono e do admin', () => {
    // O que isto trava: a recepcionista se promover a dona, ou tirar o acesso
    // de quem a convidou.
    const podem = PAPEIS.filter((r) => can(r, 'equipe'));
    expect(podem).toEqual(['OWNER', 'ADMIN']);
  });

  it('cobrança e privacidade seguem a mesma trava', () => {
    for (const cap of SO_ADMIN) {
      expect(PAPEIS.filter((r) => can(r, cap))).toEqual(['OWNER', 'ADMIN']);
    }
  });

  it('papel desconhecido não vira admin por acidente', () => {
    // Uma consulta que falhou e devolveu null, ou um valor novo no enum, não
    // pode abrir a porta da equipe nem da cobrança.
    for (const cap of SO_ADMIN) {
      expect(can(null, cap)).toBe(false);
      expect(can(undefined, cap)).toBe(false);
      expect(can('SUPERUSUARIO', cap)).toBe(false);
      expect(can('', cap)).toBe(false);
    }
    expect(can(null, 'prontuario')).toBe(can(LEAST_PRIVILEGE, 'prontuario'));
  });

  it('todo papel enxerga a agenda — é o mínimo para trabalhar', () => {
    for (const r of PAPEIS) {
      expect(can(r, 'agenda')).toBe(true);
    }
  });
});

describe('isRole', () => {
  it('reconhece os quatro do schema', () => {
    for (const r of PAPEIS) {
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
    const msg = capabilityDeniedMessage('equipe');
    expect(msg).toContain('acesso');
    expect(msg).toContain('responsável pela clínica');
  });

  it('tem texto para toda capacidade', () => {
    for (const cap of TODAS) {
      expect(capabilityDeniedMessage(cap).length).toBeGreaterThan(20);
    }
  });
});
