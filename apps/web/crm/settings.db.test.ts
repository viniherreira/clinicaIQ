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
  // As colunas da Captação, o funil principal (onde entra a etapa sem funil).
  const colunas = async () => boardStages(await db.pipelineStage.findMany({ where: { pipeline: { name: 'Captação' } } })).map((x) => x.name);

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.quickReply.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
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
    expect(await colunas()).toEqual(['Novo', 'Retorno', 'Em conversa']);
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

  it('funil novo nasce com entrada, ganho e perda; nome repetido é recusado', async () => {
    const r = await s.createPipeline(db, tenant.id, 'Harmonização');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const etapas = await db.pipelineStage.findMany({ where: { pipelineId: r.id } });
    expect(etapas.map((x) => x.role).filter(Boolean).sort()).toEqual(['LOST', 'NEW', 'WON']);
    expect((await s.createPipeline(db, tenant.id, ' harmonização ')).ok).toBe(false);
    // A mesma etapa pode existir em funis diferentes.
    expect(await s.createStage(db, tenant.id, 'Em conversa', 'blue', r.id)).toEqual({ ok: false, message: 'Já existe uma etapa com esse nome neste funil.' });
    expect(await s.createStage(db, tenant.id, 'Retorno', 'blue', r.id)).toEqual({ ok: true });
  });

  it('excluir funil leva os leads: abertos para a entrada, ganhos para o Fechou', async () => {
    const funil = (await db.pipeline.findFirst({ where: { name: 'Harmonização' } }))!;
    const principal = (await db.pipeline.findFirst({ where: { name: 'Captação' } }))!;
    const retorno = (await db.pipelineStage.findFirst({ where: { pipelineId: funil.id, name: 'Retorno' } }))!;
    const fechou = (await db.pipelineStage.findFirst({ where: { pipelineId: funil.id, role: 'WON' } }))!;
    const ator = { tenantId: tenant.id, userId: null };
    const aberto = await createLead(db, ator, { name: 'Bia', phone: '11987650888', stageId: retorno.id });
    const ganho = await createLead(db, ator, { name: 'Caio', phone: '11987650999', stageId: retorno.id });
    if (!aberto.ok || !ganho.ok) throw new Error('lead');
    await db.lead.updateMany({ where: { id: ganho.leadId }, data: { stageId: fechou.id, wonAt: new Date() } });

    expect((await s.deletePipeline(db, tenant.id, principal.id, funil.id)).ok).toBe(false);
    expect(await s.deletePipeline(db, tenant.id, funil.id, principal.id)).toEqual({ ok: true });
    const destino = await db.pipelineStage.findMany({ where: { pipelineId: principal.id } });
    const papel = (id: string) => destino.find((x) => x.id === id)?.role;
    expect(papel((await db.lead.findFirst({ where: { id: aberto.leadId } }))!.stageId)).toBe('NEW');
    expect(papel((await db.lead.findFirst({ where: { id: ganho.leadId } }))!.stageId)).toBe('WON');
    expect(await db.pipeline.count()).toBe(2);
  });

  it('Agenda e orçamentos: o papel muda de etapa (até de funil); funil com papel não se apaga', async () => {
    const agendados = (await db.pipeline.findFirst({ where: { name: 'Agendados' } }))!;
    const captacao = (await db.pipeline.findFirst({ where: { name: 'Captação' } }))!;
    const apagar = await s.deletePipeline(db, tenant.id, agendados.id, captacao.id);
    expect(apagar.ok).toBe(false);
    if (!apagar.ok) expect(apagar.message).toContain('Agenda e orçamentos');

    const conversa = (await db.pipelineStage.findFirst({ where: { pipelineId: captacao.id, name: 'Em conversa' } }))!;
    const avaliacao = (await db.pipelineStage.findFirst({ where: { role: 'SCHEDULED' } }))!;
    expect(await s.setAgendaStage(db, tenant.id, 'SCHEDULED', conversa.id)).toEqual({ ok: true });
    expect(await db.pipelineStage.count({ where: { role: 'SCHEDULED' } })).toBe(1);
    expect((await db.pipelineStage.findFirst({ where: { id: conversa.id } }))?.role).toBe('SCHEDULED');
    expect((await db.pipelineStage.findFirst({ where: { id: avaliacao.id } }))?.role).toBeNull();

    // Etapa com outro papel, entrada ou ganho não recebe.
    const novo = (await db.pipelineStage.findFirst({ where: { pipelineId: captacao.id, role: 'NEW' } }))!;
    const compareceu = (await db.pipelineStage.findFirst({ where: { role: 'ATTENDED' } }))!;
    expect((await s.setAgendaStage(db, tenant.id, 'SCHEDULED', novo.id)).ok).toBe(false);
    expect((await s.setAgendaStage(db, tenant.id, 'SCHEDULED', compareceu.id)).ok).toBe(false);

    // Desligar e voltar.
    expect(await s.setAgendaStage(db, tenant.id, 'SCHEDULED', null)).toEqual({ ok: true });
    expect(await db.pipelineStage.count({ where: { role: 'SCHEDULED' } })).toBe(0);
    expect(await s.setAgendaStage(db, tenant.id, 'SCHEDULED', avaliacao.id)).toEqual({ ok: true });
    expect((await db.pipelineStage.findFirst({ where: { id: avaliacao.id } }))?.role).toBe('SCHEDULED');
  });

  it('motivo de perda se desativa, não se apaga', async () => {
    const motivo = (await db.lostReason.findFirst())!;
    await s.toggleLostReason(db, motivo.id, false);
    expect((await db.lostReason.findFirst({ where: { id: motivo.id } }))?.active).toBe(false);
    expect((await s.upsertLostReason(db, tenant.id, { name: 'Mudou de cidade' })).ok).toBe(true);
  });

  it('resposta rápida: atalho limpo, sem repetir, edita e apaga', async () => {
    expect(await s.upsertQuickReply(db, tenant.id, { title: '/Horários de Sábado', body: 'Oi {nome}! Sábado até 12h.' })).toEqual({ ok: true });
    const r = (await db.quickReply.findFirst())!;
    expect(r.title).toBe('horarios-de-sabado');
    expect((await s.upsertQuickReply(db, tenant.id, { title: 'horarios de sabado', body: 'x' })).ok).toBe(false);
    expect((await s.upsertQuickReply(db, tenant.id, { title: 'vazio', body: '   ' })).ok).toBe(false);
    expect(await s.upsertQuickReply(db, tenant.id, { id: r.id, title: 'sabado', body: 'Sábado até 13h.' })).toEqual({ ok: true });
    expect((await db.quickReply.findFirst({ where: { id: r.id } }))?.title).toBe('sabado');
    expect(await s.deleteQuickReply(db, r.id)).toEqual({ ok: true });
    expect(await db.quickReply.count()).toBe(0);
  });
});
