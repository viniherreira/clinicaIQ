import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('campos personalizados (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead } = await import('./leads');
  const { saveField, moveField, listFieldDefs, setLeadFields } = await import('./lead-fields');
  const { loadLeadDetail } = await import('./lead-detail');

  const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `lf_${s}`, name: 'Campos', slug: `campos-${s}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Rita', email: `r-${s}@teste.local`, role: 'OWNER' } });
  const db = getTenantClient(tenant.id);
  const actor = { tenantId: tenant.id, userId: user.id };
  await ensureDefaultPipeline(db, tenant.id);

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.automationRun.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.leadField.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  let convenio = '';
  let interesses = '';
  let nascimento = '';

  it('cadastro: cria, não repete nome, lista precisa de opção e o tipo não muda', async () => {
    const a = await saveField(db, tenant.id, { name: 'Convênio', type: 'SELECT', options: ['Amil', 'Unimed', 'amil'], showOnCard: true, active: true });
    if (!a.ok) throw new Error(a.message);
    convenio = a.id;
    const b = await saveField(db, tenant.id, { name: 'Interesses', type: 'MULTISELECT', options: ['Implante', 'Clareamento'], showOnCard: false, active: true });
    if (!b.ok) throw new Error(b.message);
    interesses = b.id;
    const c = await saveField(db, tenant.id, { name: 'Nascimento', type: 'DATE', options: [], showOnCard: false, active: true });
    if (!c.ok) throw new Error(c.message);
    nascimento = c.id;

    expect((await saveField(db, tenant.id, { name: 'convênio', type: 'TEXT', options: [], showOnCard: false, active: true })).ok).toBe(false);
    expect((await saveField(db, tenant.id, { name: 'Vazia', type: 'SELECT', options: [], showOnCard: false, active: true })).ok).toBe(false);
    expect((await saveField(db, tenant.id, { id: convenio, name: 'Convênio', type: 'TEXT', options: [], showOnCard: true, active: true })).ok).toBe(false);

    const defs = await listFieldDefs(db);
    expect(defs.map((d) => d.name)).toEqual(['Convênio', 'Interesses', 'Nascimento']);
    expect(defs[0].options).toEqual(['Amil', 'Unimed']);
    await moveField(db, nascimento, -1);
    expect((await listFieldDefs(db)).map((d) => d.name)).toEqual(['Convênio', 'Nascimento', 'Interesses']);
  });

  it('valor no lead: valida, grava, apaga e conta no histórico só o que mudou', async () => {
    const r = await createLead(db, actor, { name: 'Ana', phone: '11 98888-0001' });
    if (!r.ok) throw new Error(r.message);
    const leadId = r.leadId;

    expect((await setLeadFields(db, actor, leadId, { [convenio]: 'Bradesco' })).ok).toBe(false);
    expect(await setLeadFields(db, actor, leadId, { [convenio]: 'unimed', [nascimento]: '05/03/1990' })).toEqual({ ok: true });
    // Outra pessoa, ao mesmo tempo, em outro campo: as duas gravações ficam.
    await Promise.all([
      setLeadFields(db, actor, leadId, { [interesses]: 'Implante, Clareamento' }),
      setLeadFields(db, actor, leadId, { [convenio]: 'Amil' }),
    ]);
    // Igual ao que já está: não vira histórico.
    await setLeadFields(db, actor, leadId, { [convenio]: 'amil' });
    await setLeadFields(db, actor, leadId, { [nascimento]: '' });

    const lead = await db.lead.findFirst({ where: { id: leadId } });
    expect(lead?.fields).toEqual({ [convenio]: 'Amil', [interesses]: ['Implante', 'Clareamento'] });

    const detail = await loadLeadDetail({ db, tenantId: tenant.id, userId: user.id, role: 'OWNER' } as never, leadId);
    const textos = detail!.timeline.map((t) => t.text);
    expect(textos).toContain('Convênio: Unimed');
    expect(textos).toContain('Nascimento: 05/03/1990');
    expect(textos).toContain('Convênio: Unimed → Amil');
    expect(textos).toContain('Nascimento apagado (era 05/03/1990)');
    expect(textos.filter((t) => t.startsWith('Convênio')).length).toBe(2);
  });

  it('filtro do Prisma pelo valor guardado', async () => {
    const amil = await db.lead.count({ where: { fields: { path: [convenio], equals: 'Amil' } } });
    const implante = await db.lead.count({ where: { fields: { path: [interesses], array_contains: ['Implante'] } } });
    expect(amil).toBe(1);
    expect(implante).toBe(1);
  });
});
