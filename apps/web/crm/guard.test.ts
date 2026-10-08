import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// O `redirect` do Next interrompe lançando; aqui vira um erro com o destino.
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

let acesso: { tenantId: string; userId: string; role: string } | null = null;
let crmEnabled = true;
let bloqueio: string | null = null;

vi.mock('@/lib/guard', () => ({ currentAccess: async () => acesso }));
vi.mock('@/lib/access', () => ({
  getTenantModules: async () => ({ clinic: true, crm: crmEnabled }),
  writeBlocked: async () => bloqueio,
}));
vi.mock('@clinicaiq/db', () => ({ getTenantClient: (tenantId: string) => ({ tenantId }) }));

const { requireCrm, guardCrmAction, CRM_NOT_CONTRACTED_PATH, CRM_NOT_CONTRACTED_MESSAGE } = await import('./guard');

beforeEach(() => {
  acesso = { tenantId: 't1', userId: 'u1', role: 'RECEPTIONIST' };
  crmEnabled = true;
  bloqueio = null;
});

describe('requireCrm (páginas)', () => {
  it('sem sessão vai para o login', async () => {
    acesso = null;
    await expect(requireCrm('crm')).rejects.toThrow('redirect:/sign-in');
  });

  it('clínica sem o módulo vai para a tela que explica, mesmo sendo dona', async () => {
    acesso = { tenantId: 't1', userId: 'u1', role: 'OWNER' };
    crmEnabled = false;
    await expect(requireCrm('crm')).rejects.toThrow(`redirect:${CRM_NOT_CONTRACTED_PATH}`);
  });

  it('papel sem a capacidade vai para "sem acesso"', async () => {
    await expect(requireCrm('crm_config')).rejects.toThrow('redirect:/sem-acesso?modulo=crm_config');
    acesso = { tenantId: 't1', userId: 'u1', role: 'PROFESSIONAL' };
    await expect(requireCrm('crm')).rejects.toThrow('redirect:/sem-acesso?modulo=crm');
  });

  it('com módulo e papel, devolve o banco já filtrado pela clínica', async () => {
    const ctx = await requireCrm('crm');
    expect(ctx).toMatchObject({ tenantId: 't1', userId: 'u1', role: 'RECEPTIONIST', db: { tenantId: 't1' } });
  });
});

describe('guardCrmAction (server actions)', () => {
  it('devolve mensagem em vez de redirecionar', async () => {
    crmEnabled = false;
    expect(await guardCrmAction('crm')).toEqual({ ok: false, message: CRM_NOT_CONTRACTED_MESSAGE });

    crmEnabled = true;
    const semPapel = await guardCrmAction('crm_config');
    expect(semPapel.ok).toBe(false);
  });

  it('clínica suspensa não grava no CRM', async () => {
    bloqueio = 'Plano suspenso.';
    expect(await guardCrmAction('crm')).toEqual({ ok: false, message: 'Plano suspenso.' });
  });

  it('sem sessão pede para entrar de novo', async () => {
    acesso = null;
    const r = await guardCrmAction('crm');
    expect(r.ok).toBe(false);
  });

  it('caminho feliz', async () => {
    const r = await guardCrmAction('crm');
    expect(r).toMatchObject({ ok: true, tenantId: 't1', db: { tenantId: 't1' } });
  });
});
