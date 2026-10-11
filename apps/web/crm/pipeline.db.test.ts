import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOST_REASONS, DEFAULT_STAGES } from './defaults';

/**
 * `ensureDefaultPipeline` contra o banco de desenvolvimento. Pulado onde não
 * há banco. Usa uma clínica descartável, apagada no fim.
 */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('ensureDefaultPipeline (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `pipe_${suffix}`, name: 'Funil teste', slug: `pipe-${suffix}` },
  });
  const db = getTenantClient(tenant.id);

  afterAll(async () => {
    await prisma.pipelineStage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.lostReason.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('duas aberturas ao mesmo tempo criam o funil uma vez só', async () => {
    await Promise.all([ensureDefaultPipeline(db, tenant.id), ensureDefaultPipeline(db, tenant.id)]);
    expect(await db.pipelineStage.count()).toBe(DEFAULT_STAGES.length);
    expect(await db.lostReason.count()).toBe(DEFAULT_LOST_REASONS.length);
  });

  it('rodar de novo não muda nada, nem desfaz o que a clínica renomeou', async () => {
    await db.pipelineStage.updateMany({ where: { role: 'NEW' }, data: { name: 'Chegou agora' } });
    await ensureDefaultPipeline(db, tenant.id);
    expect(await db.pipelineStage.count()).toBe(DEFAULT_STAGES.length);
    expect((await db.pipelineStage.findFirst({ where: { role: 'NEW' } }))?.name).toBe('Chegou agora');
  });
});
