import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/** Configurações do funil contra o banco de desenvolvimento. Pulado sem banco. */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('configurações do CRM (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline, boardStages } = await import('./pipeline');
  const { createLead } = await import('./leads');
  const s = await import('./settings');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `cfg_${suffix}`, name: 'Cfg', slug: `cfg-${suffix}` } });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  const colunas = async () => boardStages(await db.pipelineStage.findMany()).map((x) => x.name);

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('etapa nova entra por último entre as colunas, e nome repetido é recusado', async () => {
    expect(await s.createStage(db, tenant.id, 'Retorno', 'violet')).toEqual({ ok: true });
    expect((await colunas()).at(-1)).toBe('Retorno');
    expect((await s.createStage(db, tenant.id, '  retorno ', 'blue')).ok).toBe(false);
  });

  it('subir e descer reordena as colunas', async () => {
    const retorno = (await db.pipelineStage.findFirst({ where: { name: 'Retorno' } }))!;
    await s.moveStage(db, tenant.id, retorno.id, -1);
    expect(await colunas()).toEqual(['Novo', 'Em conversa', 'Avaliação agendada', 'Retorno', 'Em negociação']);
    await s.moveStage(db, tenant.id, (await db.pipelineStage.findFirst({ where: { role: 'NEW' } }))!.id, -1);
    expect((await colunas())[0]).toBe('Novo');
  });

  it('apagar com leads exige destino e leva os leads para lá', async () => {
    const retorno = (await db.pipelineStage.findFirst({ where: { name: 'Retorno' } }))!;
    const conversa = (await db.pipelineStage.findFirst({ where: { name: 'Em conversa' } }))!;
    await createLead(db, { tenantId: tenant.id, userId: null }, { name: 'Lia', phone: '11987650777', stageId: retorno.id });

    expect((await s.deleteStage(db, tenant.id, retorno.id, null)).ok).toBe(false);
    expect(await s.deleteStage(db, tenant.id, retorno.id, conversa.id)).toEqual({ ok: true });
    expect((await db.lead.findFirst({ where: { name: 'Lia' } }))?.stageId).toBe(conversa.id);
    expect(await colunas()).not.toContain('Retorno');
  });

  it('etapa com papel não se apaga', async () => {
    const novo = (await db.pipelineStage.findFirst({ where: { role: 'NEW' } }))!;
    expect((await s.deleteStage(db, tenant.id, novo.id, null)).ok).toBe(false);
  });

  it('apagar tag tira ela dos leads', async () => {
    await s.upsertTag(db, tenant.id, { name: 'VIP', color: 'amber' });
    const tag = (await db.leadTag.findFirst({ where: { name: 'vip' } }))!;
    const lia = (await db.lead.findFirst({ where: { name: 'Lia' } }))!;
    await db.leadTagOnLead.create({ data: { tenantId: tenant.id, leadId: lia.id, tagId: tag.id } });
    expect(await s.deleteTag(db, tenant.id, tag.id)).toEqual({ ok: true });
    expect(await db.leadTagOnLead.count({ where: { leadId: lia.id } })).toBe(0);
  });

  it('motivo de perda se desativa, não se apaga', async () => {
    const motivo = (await db.lostReason.findFirst())!;
    await s.toggleLostReason(db, motivo.id, false);
    expect((await db.lostReason.findFirst({ where: { id: motivo.id } }))?.active).toBe(false);
    expect((await s.upsertLostReason(db, tenant.id, { name: 'Mudou de cidade' })).ok).toBe(true);
  });
});
