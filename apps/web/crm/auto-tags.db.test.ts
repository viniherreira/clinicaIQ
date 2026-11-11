import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

/** Tags automáticas: canal de entrada em todo lead novo e procedimentos citados. */
describe.skipIf(!process.env.DATABASE_URL)('tags automáticas (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead, updateLead } = await import('./leads');
  const { applyOrigin } = await import('./ad-origin');
  const { applyProcedureTags } = await import('./auto-tags');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `at_${suffix}`, name: 'Tags', slug: `at-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `at-${suffix}@teste.local`, role: 'OWNER' } });
  const db = getTenantClient(tenant.id);
  const actor = { tenantId: tenant.id, userId: user.id };
  await ensureDefaultPipeline(db, tenant.id);
  const implante = await prisma.procedure.create({
    data: { tenantId: tenant.id, name: 'Implante unitário', basePrice: 3000, durationMinutes: 60 },
  });

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.procedure.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  const tagsDo = async (leadId: string) =>
    (await db.leadTagOnLead.findMany({ where: { leadId }, select: { tag: { select: { name: true } } } })).map((t) => t.tag.name).sort();
  const novo = async (phone: string, source?: 'WHATSAPP' | 'MANUAL' | 'INDICACAO') => {
    const r = await createLead(db, actor, { name: 'Ana', phone, source });
    if (!r.ok) throw new Error(r.message);
    return r.leadId;
  };

  it('lead do WhatsApp nasce com a tag whatsapp; manual nasce sem', async () => {
    expect(await tagsDo(await novo('11 97777-1001', 'WHATSAPP'))).toEqual(['whatsapp']);
    expect(await tagsDo(await novo('11 97777-1002', 'MANUAL'))).toEqual([]);
  });

  it('anúncio do Instagram troca a tag whatsapp pela instagram', async () => {
    const id = await novo('11 97777-1003', 'WHATSAPP');
    await applyOrigin(db, tenant.id, id, 'INSTAGRAM', { sourceUrl: 'https://www.instagram.com/p/x', headline: 'Implante' });
    expect(await tagsDo(id)).toEqual(['instagram']);
  });

  it('mudar a origem à mão troca a tag do canal', async () => {
    const id = await novo('11 97777-1004', 'WHATSAPP');
    await updateLead(db, actor, id, { source: 'INDICACAO' });
    expect(await tagsDo(id)).toEqual(['indicação']);
  });

  it('procedimento citado vira tag e o interesse do lead', async () => {
    const id = await novo('11 97777-1005', 'WHATSAPP');
    expect(await applyProcedureTags(db, tenant.id, id, 'Oi! Quanto custa implante e clareamento?')).toEqual(['implante', 'clareamento']);
    expect(await tagsDo(id)).toEqual(['clareamento', 'implante', 'whatsapp']);
    const lead = await db.lead.findFirst({ where: { id }, select: { interestProcedureId: true } });
    expect(lead?.interestProcedureId).toBe(implante.id);
    // Repetir não duplica nem anota de novo.
    expect(await applyProcedureTags(db, tenant.id, id, 'é o implante mesmo')).toEqual([]);
  });

  it('desligado nas configurações: lead novo sem tag de canal', async () => {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: { crm: { autoTags: false } } } });
    expect(await tagsDo(await novo('11 97777-1006', 'WHATSAPP'))).toEqual([]);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: {} } });
  });
});
