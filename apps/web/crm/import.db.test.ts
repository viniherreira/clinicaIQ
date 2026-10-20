import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ImportRecord } from './import-map';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

const rec = (over: Partial<ImportRecord>): ImportRecord => ({
  line: 2,
  title: null,
  name: 'Pessoa',
  phone: '5511990000000',
  email: null,
  valueCents: null,
  pipeline: null,
  stage: null,
  outcome: 'open',
  responsible: null,
  tags: [],
  createdAt: null,
  closedAt: null,
  source: null,
  notes: [],
  lostReason: null,
  fields: {},
  ...over,
});

describe.skipIf(!process.env.DATABASE_URL)('importar planilha (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead } = await import('./leads');
  const { importBatch, previewImport, createImportFields } = await import('./import');

  const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `im_${s}`, name: 'Importa', slug: `importa-${s}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Rita Dono', email: `r-${s}@teste.local`, role: 'OWNER' } });
  const bia = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Bia Souza', email: `b-${s}@teste.local`, role: 'RECEPTIONIST' } });
  const db = getTenantClient(tenant.id);
  const ctx = { db, tenantId: tenant.id, userId: user.id, role: 'OWNER' as const };
  await ensureDefaultPipeline(db, tenant.id);
  const etapas = await db.pipelineStage.findMany({ orderBy: { order: 'asc' } });
  const conversa = etapas.find((e) => e.name === 'Em conversa')!;
  // Automação na etapa: importar não pode disparar.
  const tagAuto = await db.leadTag.create({ data: { tenantId: tenant.id, name: 'auto', color: 'blue' } });
  await db.stageAutomation.create({ data: { tenantId: tenant.id, stageId: conversa.id, action: 'ADD_TAG', config: { tagId: tagAuto.id } } });
  const convenio = await db.leadField.create({ data: { tenantId: tenant.id, name: 'Convênio', type: 'SELECT', options: ['Amil', 'Unimed'] } });

  const opts = { duplicates: 'skip' as const, pipelineId: null, createMissing: true };

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.automationRun.deleteMany({ where: t });
    await prisma.stageAutomation.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.leadField.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('prévia: duplicados, funil e etapa novos, tags novas e responsável desconhecido', async () => {
    await createLead(db, { tenantId: tenant.id, userId: user.id }, { name: 'Já existe', phone: '5511990000001' });
    const p = await previewImport(
      ctx,
      {
        phones: ['5511990000001', '5511990000002'],
        stages: [
          { pipeline: null, stage: 'Em conversa' },
          { pipeline: 'Harmonização', stage: 'Primeiro contato' },
        ],
        tags: ['auto', 'vip'],
        responsibles: ['bia souza', 'Carlos'],
      },
      null,
    );
    expect(p.duplicates).toBe(1);
    expect(p.newPipelines).toEqual(['Harmonização']);
    expect(p.newStages).toEqual([{ pipeline: 'Harmonização', stage: 'Primeiro contato' }]);
    expect(p.newTags).toEqual(['vip']);
    expect(p.unknownResponsibles).toEqual(['Carlos']);
  });

  it('cria aberto, ganho e perdido; funil e etapa novos; tags, nota, campo, responsável e data; sem automação', async () => {
    const r = await importBatch(
      ctx,
      [
        rec({
          line: 2,
          title: 'Implante',
          name: 'Ana',
          phone: '5511990000010',
          stage: 'Em conversa',
          responsible: 'Bia Souza',
          tags: ['vip'],
          notes: ['Quer começar em novembro'],
          createdAt: '2026-03-01T13:00:00.000Z',
          fields: { [`field:${convenio.id}`]: 'unimed' },
          valueCents: 250000,
        }),
        rec({ line: 3, title: 'Botox', name: 'Bia', phone: '5511990000011', pipeline: 'Harmonização', stage: 'Primeiro contato' }),
        rec({ line: 4, title: 'Clareamento', name: 'Caio', phone: '5511990000012', outcome: 'won', closedAt: '2026-04-10T15:00:00.000Z' }),
        rec({ line: 5, title: 'Lente', name: 'Duda', phone: '5511990000013', outcome: 'lost', lostReason: 'Preço alto' }),
        rec({ line: 6, title: 'Faceta', name: 'Eva', phone: '5511990000014', fields: { [`field:${convenio.id}`]: 'Bradesco' } }),
      ],
      opts,
    );
    expect(r).toMatchObject({ created: 5, updated: 0, skipped: 0 });
    expect(r.problems).toEqual([{ line: 6, message: expect.stringMatching(/^importado, mas Convênio/) }]);

    const ana = await db.lead.findFirst({ where: { title: 'Implante' }, include: { tags: { include: { tag: true } } } });
    expect(ana).toMatchObject({ stageId: conversa.id, assignedToId: bia.id, estimatedValueCents: 250000, fields: { [convenio.id]: 'Unimed' } });
    expect(ana!.createdAt.toISOString()).toBe('2026-03-01T13:00:00.000Z');
    expect(ana!.tags.map((t) => t.tag.name)).toEqual(['vip']);
    expect(await db.automationRun.count({ where: { leadId: ana!.id } })).toBe(0);
    expect(await db.leadActivity.count({ where: { leadId: ana!.id, type: 'NOTE' } })).toBe(1);

    const harmo = await db.pipeline.findFirst({ where: { name: 'Harmonização' } });
    const botox = await db.lead.findFirst({ where: { title: 'Botox' }, include: { stage: true } });
    expect(botox!.stage).toMatchObject({ pipelineId: harmo!.id, name: 'Primeiro contato' });

    const caio = await db.lead.findFirst({ where: { title: 'Clareamento' }, include: { stage: true } });
    expect(caio!.stage.role).toBe('WON');
    expect(caio!.wonAt?.toISOString()).toBe('2026-04-10T15:00:00.000Z');

    const duda = await db.lead.findFirst({ where: { title: 'Lente' }, include: { stage: true, lostReason: true } });
    expect(duda!.stage.role).toBe('LOST');
    expect(duda!.lostReason?.name).toBe('Preço alto');
  });

  it('duplicados: pula, atualiza ou cria de novo', async () => {
    const a = rec({ line: 2, title: 'Implante', name: 'Ana', phone: '5511990000010', tags: ['retorno'], email: 'ana@x.com' });
    expect(await importBatch(ctx, [a], opts)).toMatchObject({ created: 0, skipped: 1 });

    const u = await importBatch(ctx, [{ ...a, stage: 'Avaliação agendada' }], { ...opts, duplicates: 'update' });
    expect(u).toMatchObject({ created: 0, updated: 1 });
    const ana = await db.lead.findFirst({ where: { title: 'Implante' }, include: { stage: true, tags: { include: { tag: true } } } });
    expect(ana!.email).toBe('ana@x.com');
    expect(ana!.stage.name).toBe('Avaliação agendada');
    expect(ana!.tags.map((t) => t.tag.name).sort()).toEqual(['retorno', 'vip']);

    // Negócio fechado igual (mesmo título e telefone) também é duplicado.
    const ganho = rec({ title: 'Clareamento', phone: '5511990000012', outcome: 'won' });
    expect(await importBatch(ctx, [ganho], opts)).toMatchObject({ skipped: 1 });

    expect(await importBatch(ctx, [a], { ...opts, duplicates: 'create' })).toMatchObject({ created: 1 });
    expect(await db.lead.count({ where: { title: 'Implante' } })).toBe(2);
  });

  it('sem criar funis: funil desconhecido cai no escolhido, etapa desconhecida na entrada', async () => {
    const r = await importBatch(ctx, [rec({ title: 'Ortodontia', phone: '5511990000020', pipeline: 'Não existe', stage: 'Nem esta' })], {
      ...opts,
      createMissing: false,
    });
    expect(r.created).toBe(1);
    const l = await db.lead.findFirst({ where: { title: 'Ortodontia' }, include: { stage: true } });
    expect(l!.stage.role).toBe('NEW');
    expect(await db.pipeline.count({ where: { name: 'Não existe' } })).toBe(0);
  });

  it('campos novos: cria um e reaproveita o de mesmo nome', async () => {
    const r = await createImportFields(ctx, [
      { key: 'new:3', name: 'Como conheceu', type: 'SELECT', options: ['Instagram', 'Google'] },
      { key: 'new:4', name: 'convênio', type: 'TEXT', options: [] },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const novo = await db.leadField.findFirst({ where: { name: 'Como conheceu' } });
    expect(r.keys).toEqual({ 'new:3': `field:${novo!.id}`, 'new:4': `field:${convenio.id}` });
  });
});
