import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** O quadro carregando por coluna, contra o banco de desenvolvimento, numa clínica descartável com 120 leads. */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('quadro por coluna (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { BOARD_PAGE, boardColumnStats, loadBoardLeads, loadColumnLeads } = await import('./board-data');
  const { parseFilters } = await import('./filters');
  const { encryptPhone, phoneHash } = await import('./phone');
  type Ctx = Parameters<typeof loadBoardLeads>[0];

  const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `qc_${s}`, name: 'Quadro', slug: `qc-${s}` } });
  const dona = await prisma.user.create({ data: { tenantId: tenant.id, name: 'dona', email: `dona-${s}@teste.local`, role: 'OWNER', crmSeat: true } });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  const funil = (await db.pipeline.findFirst({ select: { id: true } }))!;
  const abertas = await db.pipelineStage.findMany({
    where: { pipelineId: funil.id, OR: [{ role: null }, { role: { notIn: ['WON', 'LOST'] } }] },
    orderBy: { order: 'asc' },
    select: { id: true },
  });
  const [a, b] = [abertas[0]!.id, abertas[1]!.id];
  const ctx = { tenantId: tenant.id, userId: dona.id, ownOnly: false, db } as unknown as Ctx;
  const filtros = { ...parseFilters({}), funil: funil.id };

  const fone = (i: number) => `5511${String(900000000 + i)}`;
  await prisma.lead.createMany({
    data: [
      ...Array.from({ length: 120 }, (_, i) => ({
        tenantId: tenant.id, name: `A${i}`, stageId: a, position: i, estimatedValueCents: 100,
        phoneEncrypted: encryptPhone(fone(i), tenant.id), phoneHash: phoneHash(fone(i), tenant.id),
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        tenantId: tenant.id, name: `B${i}`, stageId: b, position: i, estimatedValueCents: 1000,
        phoneEncrypted: encryptPhone(fone(500 + i), tenant.id), phoneHash: phoneHash(fone(500 + i), tenant.id),
      })),
      // Fechado não entra no quadro nem nas contas.
      { tenantId: tenant.id, name: 'Ganho', stageId: a, wonAt: new Date(), phoneEncrypted: encryptPhone(fone(900), tenant.id), phoneHash: phoneHash(fone(900), tenant.id) },
    ],
  });

  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.lostReason.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.pipelineStage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.pipeline.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('a página traz só os primeiros de cada coluna', async () => {
    const leads = await loadBoardLeads(ctx, filtros, [a, b]);
    expect(leads.filter((l) => l.stageId === a)).toHaveLength(BOARD_PAGE);
    expect(leads.filter((l) => l.stageId === b)).toHaveLength(3);
    expect(leads.filter((l) => l.stageId === a).map((l) => l.name).slice(0, 2)).toEqual(['A0', 'A1']);
  });

  it('rolando, as levas seguintes vêm na ordem, sem repetir e até o fim', async () => {
    const vistos = new Set<string>();
    for (let skip = 0; ; skip += BOARD_PAGE) {
      const leva = await loadColumnLeads(ctx, filtros, a, skip);
      for (const l of leva) vistos.add(l.id);
      if (leva.length < BOARD_PAGE) break;
    }
    expect(vistos.size).toBe(120);
    expect((await loadColumnLeads(ctx, filtros, a, 100)).map((l) => l.name)[0]).toBe('A100');
  });

  it('as contas do topo contam todos os abertos, não só os carregados', async () => {
    const stats = await boardColumnStats(ctx, filtros);
    expect(stats[a]).toEqual({ count: 120, valueCents: 12_000 });
    expect(stats[b]).toEqual({ count: 3, valueCents: 3000 });
  });

  it('com filtro de uma etapa, as outras colunas vêm vazias', async () => {
    const soB = { ...filtros, etapa: b };
    expect(await loadColumnLeads(ctx, soB, a, 0)).toEqual([]);
    expect(await loadBoardLeads(ctx, soB, [a, b])).toHaveLength(3);
  });
});
