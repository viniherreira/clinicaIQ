import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/** Apagar os dados de uma pessoa (LGPD) contra o banco de desenvolvimento, numa clínica descartável. */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('apagar dados pessoais (banco)', async () => {
  const { prisma, getTenantClient, encrypt, decrypt } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead, addNote } = await import('./leads');
  const { conversationHash } = await import('./phone');
  const { chatKey } = await import('@/lib/phone');
  const { eraseLeadPersonalData, ERASED_NAME } = await import('./anonymize');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `lgpd_${suffix}`, name: 'LGPD', slug: `lgpd-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `d-${suffix}@teste.local`, role: 'OWNER' } });
  const db = getTenantClient(tenant.id);
  const actor = { tenantId: tenant.id, userId: user.id };
  await ensureDefaultPipeline(db, tenant.id);

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.auditLog.deleteMany({ where: t });
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('apaga a pessoa em todos os negócios e conversas; o negócio fechado continua contando', async () => {
    const fone = '(11) 98765-4400';
    const antigo = await createLead(db, actor, { name: 'Marina Souza', phone: fone });
    if (!antigo.ok) throw new Error(antigo.message);
    await prisma.lead.update({ where: { id: antigo.leadId }, data: { wonAt: new Date(), estimatedValueCents: 500_000 } });
    const atual = await createLead(db, actor, { name: 'Marina S.', phone: fone, email: 'marina@exemplo.com' });
    if (!atual.ok) throw new Error(atual.message);
    await addNote(db, actor, atual.leadId, 'Mora na Rua das Flores, 10');
    await prisma.leadTask.create({ data: { tenantId: tenant.id, leadId: atual.leadId, text: 'Ligar', dueAt: new Date(), assignedToId: user.id } });
    const tag = await prisma.leadTag.create({ data: { tenantId: tenant.id, name: `vip-${suffix}`, color: 'blue' } });
    await prisma.leadTagOnLead.create({ data: { tenantId: tenant.id, leadId: atual.leadId, tagId: tag.id } });

    // A conversa do WhatsApp dela e a de outra pessoa, que não pode ser tocada.
    const conversa = async (phone: string, leadId: string | null) => {
      const k = chatKey(phone);
      const c = await prisma.conversation.create({
        data: { tenantId: tenant.id, phoneHash: conversationHash(k, tenant.id), phoneEncrypted: encrypt(k, key, tenant.id), status: 'ACTIVE', leadId },
      });
      await prisma.chatMessage.create({
        data: {
          tenantId: tenant.id, conversationId: c.id, direction: 'INBOUND', origin: 'CONTACT', kind: 'IMAGE',
          textEncrypted: encrypt('meu documento', key, tenant.id), externalId: `x-${c.id}`, mediaRef: `local:${tenant.id}/crm/${c.id}/a/rg.png`,
        },
      });
      return c;
    };
    const dela = await conversa(fone, null);
    const outra = await conversa('(11) 91111-2222', null);

    const r = await eraseLeadPersonalData(db, actor, atual.leadId);
    expect(r).toMatchObject({ ok: true, leads: 2, conversations: 1 });
    if (!r.ok) return;
    expect(r.mediaRefs).toEqual([`local:${tenant.id}/crm/${dela.id}/a/rg.png`]);

    const leads = await prisma.lead.findMany({ where: { tenantId: tenant.id, id: { in: [antigo.leadId, atual.leadId] } } });
    for (const l of leads) {
      expect(l.name).toBe(ERASED_NAME);
      expect(l.email).toBeNull();
      expect(l.notes).toBeNull();
      expect(decrypt(l.phoneEncrypted, key, tenant.id)).toBe('');
    }
    const fechado = leads.find((l) => l.id === antigo.leadId)!;
    const aberto = leads.find((l) => l.id === atual.leadId)!;
    expect(fechado.deletedAt).toBeNull();
    expect(fechado.estimatedValueCents).toBe(500_000);
    expect(aberto.deletedAt).not.toBeNull();

    const t = { tenantId: tenant.id };
    expect(await prisma.leadActivity.count({ where: { ...t, leadId: { in: [antigo.leadId, atual.leadId] } } })).toBe(0);
    expect(await prisma.leadTask.count({ where: t })).toBe(0);
    expect(await prisma.leadTagOnLead.count({ where: t })).toBe(0);
    expect(await prisma.conversation.findMany({ where: t, select: { id: true } })).toEqual([{ id: outra.id }]);
    expect(await prisma.chatMessage.count({ where: { ...t, conversationId: outra.id } })).toBe(1);

    const audit = await prisma.auditLog.findFirst({ where: { ...t, action: 'LEAD_PERSONAL_DATA_ERASED' } });
    expect(audit).toMatchObject({ entityId: atual.leadId, userId: user.id });

    // Um novo lead com o mesmo número não acha mais a pessoa apagada.
    const de_novo = await createLead(db, actor, { name: 'Marina', phone: fone });
    expect(de_novo.ok).toBe(true);

    // Pedir de novo não faz nada.
    expect(await eraseLeadPersonalData(db, actor, atual.leadId)).toMatchObject({ ok: false });
  });
});
