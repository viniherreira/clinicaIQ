import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Isolamento entre clínicas nas tabelas do CRM, contra um banco de verdade.
 *
 * `getTenantClient` filtra por `tenantId` todo modelo que não esteja em
 * `MODELS_WITHOUT_TENANT`. Este teste prova que as tabelas novas entraram nessa
 * regra — inclusive a de ligação `LeadTagOnLead`, que é a mais fácil de esquecer.
 *
 * Precisa de banco: roda quando há `DATABASE_URL` (o `.env` do pacote em
 * desenvolvimento) e é pulado onde não há.
 */
const envFile = resolve(__dirname, '..', '.env');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('isolamento entre clínicas — CRM', async () => {
  const { prisma, getTenantClient } = await import('./client');
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let a: { tenantId: string; userId: string; leadId: string; taskId: string; tagId: string };
  let b: { tenantId: string };

  beforeAll(async () => {
    const tenantA = await prisma.tenant.create({
      data: { clerkOrgId: `iso_a_${suffix}`, name: 'Isolamento A', slug: `iso-a-${suffix}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { clerkOrgId: `iso_b_${suffix}`, name: 'Isolamento B', slug: `iso-b-${suffix}` },
    });
    const user = await prisma.user.create({
      data: { tenantId: tenantA.id, name: 'Dono A', email: `a-${suffix}@teste.local`, role: 'OWNER' },
    });
    const stage = await prisma.pipelineStage.create({
      data: { tenantId: tenantA.id, name: 'Novo', color: 'gray', order: 1, role: 'NEW' },
    });
    const lead = await prisma.lead.create({
      data: { tenantId: tenantA.id, name: 'Lead A', phoneEncrypted: 'x', phoneHash: 'h', stageId: stage.id },
    });
    const task = await prisma.leadTask.create({
      data: { tenantId: tenantA.id, leadId: lead.id, text: 'Ligar', dueAt: new Date(), assignedToId: user.id },
    });
    const tag = await prisma.leadTag.create({ data: { tenantId: tenantA.id, name: 'implante', color: 'violet' } });
    await prisma.leadTagOnLead.create({ data: { tenantId: tenantA.id, leadId: lead.id, tagId: tag.id } });

    a = { tenantId: tenantA.id, userId: user.id, leadId: lead.id, taskId: task.id, tagId: tag.id };
    b = { tenantId: tenantB.id };
  });

  afterAll(async () => {
    if (!a) return;
    const tenantIds = [a.tenantId, b.tenantId];
    await prisma.leadTagOnLead.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.leadTag.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.leadTask.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.lead.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.pipelineStage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('a própria clínica enxerga o que é dela', async () => {
    const db = getTenantClient(a.tenantId);
    expect(await db.lead.count()).toBe(1);
    expect(await db.leadTask.count()).toBe(1);
    expect(await db.leadTagOnLead.count()).toBe(1);
  });

  it('outra clínica não lê nada', async () => {
    const db = getTenantClient(b.tenantId);
    expect(await db.lead.findMany()).toEqual([]);
    expect(await db.lead.findFirst({ where: { id: a.leadId } })).toBeNull();
    expect(await db.leadTask.findMany()).toEqual([]);
    expect(await db.leadTagOnLead.findMany()).toEqual([]);
    expect(await db.leadTag.findMany()).toEqual([]);
  });

  it('outra clínica não altera nem apaga', async () => {
    const db = getTenantClient(b.tenantId);
    const updated = await db.lead.updateMany({ where: { id: a.leadId }, data: { name: 'Invadido' } });
    expect(updated.count).toBe(0);
    await expect(db.lead.update({ where: { id: a.leadId }, data: { name: 'Invadido' } })).rejects.toThrow();
    expect((await db.leadTask.deleteMany({ where: { id: a.taskId } })).count).toBe(0);
    expect((await db.leadTagOnLead.deleteMany({ where: { leadId: a.leadId } })).count).toBe(0);

    const lead = await prisma.lead.findUnique({ where: { id: a.leadId } });
    expect(lead?.name).toBe('Lead A');
  });

  it('o que outra clínica cria fica sempre na clínica dela', async () => {
    const db = getTenantClient(b.tenantId);
    // Mesmo pedindo explicitamente o tenantId de A, a extensão sobrescreve.
    const tag = await db.leadTag.create({ data: { tenantId: a.tenantId, name: `b-${suffix}`, color: 'gray' } });
    expect(tag.tenantId).toBe(b.tenantId);
  });
});
