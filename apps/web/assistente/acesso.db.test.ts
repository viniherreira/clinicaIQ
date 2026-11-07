import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('acesso ao assistente (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { assistenteLiberado, checarLimites, LIMITE_HORA_USUARIO } = await import('./acesso');
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `iaa_${sufixo}`, name: 'A', slug: `iaa-${sufixo}` } });
  const plano = await prisma.plan.findFirst({ where: { assistantEnabled: false } });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "rate_limits" WHERE "key" LIKE ${`assistente:%${tenant.id}%`}`;
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('sem assinatura: fechado', async () => {
    expect(await assistenteLiberado(tenant.id)).toBe(false);
  });

  it('assinatura sem a chave: fechado; com a chave: aberto', async () => {
    await prisma.subscription.create({
      data: { tenantId: tenant.id, tier: plano!.tier, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
    expect(await assistenteLiberado(tenant.id)).toBe(false);
    await prisma.subscription.update({ where: { tenantId: tenant.id }, data: { assistantEnabled: true } });
    expect(await assistenteLiberado(tenant.id)).toBe(true);
  });

  it(`barra depois de ${LIMITE_HORA_USUARIO} perguntas por hora do mesmo usuário`, async () => {
    for (let i = 0; i < LIMITE_HORA_USUARIO; i++) expect((await checarLimites(tenant.id, 'u1')).ok).toBe(true);
    const r = await checarLimites(tenant.id, 'u1');
    expect(r.ok).toBe(false);
    expect((await checarLimites(tenant.id, 'u2')).ok).toBe(true);
  });
});
