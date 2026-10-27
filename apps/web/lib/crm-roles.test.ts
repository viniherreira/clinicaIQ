import { describe, expect, it } from 'vitest';
import { canSeeAssigned, crmRoleLocked, effectiveCrmRole, isCrmManager, seesOnlyOwn } from './crm-roles';

describe('effectiveCrmRole', () => {
  it('o dono é sempre Gestor, mesmo com outro cargo gravado', () => {
    expect(effectiveCrmRole('OWNER', 'AGENT_OWN')).toBe('MANAGER');
    expect(crmRoleLocked('OWNER')).toBe(true);
    expect(crmRoleLocked('ADMIN')).toBe(false);
  });

  it('sem cargo escolhido, vale o padrão do perfil', () => {
    expect(effectiveCrmRole('ADMIN', null)).toBe('MANAGER');
    expect(effectiveCrmRole('RECEPTIONIST', null)).toBe('AGENT');
    expect(effectiveCrmRole('PROFESSIONAL', undefined)).toBe('AGENT');
  });

  it('o cargo escolhido manda, e valor estranho volta ao padrão', () => {
    expect(effectiveCrmRole('ADMIN', 'AGENT')).toBe('AGENT');
    expect(effectiveCrmRole('RECEPTIONIST', 'MANAGER')).toBe('MANAGER');
    expect(effectiveCrmRole('RECEPTIONIST', 'SUPER')).toBe('AGENT');
  });
});

describe('visibilidade', () => {
  const eu = 'u1';
  it('Gestor e Atendente veem tudo', () => {
    expect(canSeeAssigned({ userId: eu, crmRole: 'MANAGER' }, 'outro')).toBe(true);
    expect(canSeeAssigned({ userId: eu, crmRole: 'AGENT' }, 'outro')).toBe(true);
    expect(isCrmManager('AGENT')).toBe(false);
  });

  it('só os dele: os seus e os sem responsável', () => {
    const v = { userId: eu, crmRole: 'AGENT_OWN' as const };
    expect(seesOnlyOwn('AGENT_OWN')).toBe(true);
    expect(canSeeAssigned(v, eu)).toBe(true);
    expect(canSeeAssigned(v, null)).toBe(true);
    expect(canSeeAssigned(v, 'outro')).toBe(false);
  });
});
