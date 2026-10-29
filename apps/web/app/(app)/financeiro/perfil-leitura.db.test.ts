import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

let logado: string | null = null;
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: logado }) }));

/**
 * Hoje todo perfil tem financeiro e configurações, então ler sem conferir o
 * perfil não vazava nada. Mas a matriz vai mudar (a recepção não precisa de
 * relatório financeiro), e no dia em que mudar estas Server Actions — que são
 * endereços públicos — continuariam respondendo (achado F-14 da auditoria).
 *
 * Aqui a recepção perde `financeiro` e `configuracoes` só neste teste, e cada
 * ação tem de recusar.
 */
vi.mock('@/lib/permissions', async (original) => {
  const real = await original<typeof import('@/lib/permissions')>();
  return {
    ...real,
    can: (role: string | null | undefined, capability: string) =>
      role === 'RECEPTIONIST' && (capability === 'financeiro' || capability === 'configuracoes')
        ? false
        : real.can(role, capability as Parameters<typeof real.can>[1]),
  };
});

const envFile = resolve(__dirname, '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('leituras conferem o perfil (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { getFinanceData } = await import('./actions');
  const { getReportData } = await import('./report-actions');
  const { listQuotes, getQuote, getContractGaps } = await import('../orcamentos/actions');
  const { sendTestMessage } = await import('../whatsapp/actions');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `perfil_${suffix}`, name: 'Perfil teste', slug: `perfil-${suffix}` },
  });
  await prisma.subscription.create({
    data: { tenantId: tenant.id, tier: 'CLINICA', status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01') },
  });
  logado = `user_perfil_${suffix}`;
  await prisma.user.create({
    data: { tenantId: tenant.id, clerkUserId: logado, name: 'Recepção', email: `rec-${suffix}@teste.local`, role: 'RECEPTIONIST' },
  });

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.user.deleteMany({ where: t });
    await prisma.subscription.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  const semAcesso = /redirect:\/sem-acesso\?modulo=financeiro/;

  it('financeiro e relatórios', async () => {
    await expect(getFinanceData({ from: '2026-01-01', to: '2026-01-31' })).rejects.toThrow(semAcesso);
    await expect(getReportData({ type: 'agendamentos', from: '2026-01-01', to: '2026-01-31' })).rejects.toThrow(semAcesso);
  });

  it('orçamentos', async () => {
    await expect(listQuotes({})).rejects.toThrow(semAcesso);
    await expect(getQuote('qualquer')).rejects.toThrow(semAcesso);
    await expect(getContractGaps('qualquer')).rejects.toThrow(semAcesso);
  });

  it('mensagem de teste do WhatsApp', async () => {
    const r = await sendTestMessage('11987650005');
    expect(r.success).toBe(false);
    expect(r.message).toContain('perfil');
  });
});
