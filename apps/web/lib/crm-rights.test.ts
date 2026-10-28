import { describe, expect, it } from 'vitest';
import { effectiveRights, levelAllows, presetOf, readRights, ROLE_RIGHTS } from './crm-rights';

describe('effectiveRights', () => {
  it('o dono tem tudo, mesmo com permissões gravadas', () => {
    expect(effectiveRights('OWNER', 'AGENT_OWN', { leads: { view: 'own' } })).toEqual(ROLE_RIGHTS.MANAGER);
  });

  it('sem permissões gravadas, vale o cargo', () => {
    expect(effectiveRights('RECEPTIONIST', null, null)).toEqual(ROLE_RIGHTS.AGENT);
    expect(effectiveRights('ADMIN', 'AGENT_OWN', null)).toEqual(ROLE_RIGHTS.AGENT_OWN);
  });

  it('permissões gravadas por cima do cargo (Personalizado)', () => {
    const r = effectiveRights('RECEPTIONIST', 'AGENT', { leads: { export: 'all' } });
    expect(r.leads.export).toBe('all');
    expect(r.leads.delete).toBe('none');
    expect(presetOf(r)).toBeNull();
    expect(presetOf(ROLE_RIGHTS.AGENT_OWN)).toBe('AGENT_OWN');
  });
});

describe('readRights', () => {
  it('editar e excluir nunca passam de ver', () => {
    const r = readRights({ leads: { view: 'own', edit: 'all', delete: 'all' }, tasks: { edit: 'all' } }, ROLE_RIGHTS.AGENT);
    expect(r.leads).toMatchObject({ view: 'own', edit: 'own', delete: 'own' });
    expect(r.tasks.edit).toBe('own');
  });

  it('valor que a célula não aceita volta ao do cargo', () => {
    const r = readRights({ leads: { view: 'none', create: 'own', export: 'talvez' } }, ROLE_RIGHTS.AGENT);
    expect(r.leads).toMatchObject({ view: 'all', create: 'all', export: 'none' });
  });
});

describe('levelAllows', () => {
  it('se responsável: os seus e os sem responsável', () => {
    expect(levelAllows('own', 'eu', 'eu')).toBe(true);
    expect(levelAllows('own', 'eu', null)).toBe(true);
    expect(levelAllows('own', 'eu', 'outro')).toBe(false);
    expect(levelAllows('none', 'eu', 'eu')).toBe(false);
    expect(levelAllows('all', 'eu', 'outro')).toBe(true);
  });
});
