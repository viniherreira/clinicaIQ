import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Troca da chave mestra (achado F-16): com a chave 2 ligada, o que foi gravado
 * com a 1 continua achável e abrindo, e o relógio recifra tudo — CPF,
 * telefones, mensagens — refazendo os índices cegos. Numa clínica descartável:
 * a rodada é limitada a ela, para não mexer no resto do banco de dev.
 */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('troca da chave mestra (banco)', async () => {
  const { prisma, getTenantClient, encrypt, decrypt, keyVersionOf } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('@/crm/pipeline');
  const { createLead } = await import('@/crm/leads');
  const { findOpenLeadByPhone } = await import('@/crm/duplicates');
  const { conversationHash, conversationHashes } = await import('@/crm/phone');
  const { cpfHash, cpfTaken } = await import('./cpf-hash');
  const { reencryptWithCurrentKey } = await import('./key-rotation');
  const { chatKey } = await import('@/lib/phone');

  const OLD = process.env.ENCRYPTION_MASTER_KEY!;
  const NEW = 'unit-test-rotated-master-key-not-real';
  const ambiente = { ...process.env };

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `rot_${suffix}`, name: 'Rotação', slug: `rot-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `d-${suffix}@teste.local`, role: 'OWNER' } });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);

  // Tudo gravado com a chave 1, como está em produção hoje.
  const paciente = await prisma.patient.create({
    data: {
      tenantId: tenant.id,
      controlNumber: 1,
      name: 'Paciente',
      cpfEncrypted: encrypt('52998224725', OLD, tenant.id),
      cpfHash: cpfHash('52998224725', tenant.id),
      phoneEncrypted: encrypt('11987650000', OLD, tenant.id),
      lgpdConsentAt: new Date(),
    },
  });
  const lead = await createLead(db, { tenantId: tenant.id, userId: user.id }, { name: 'Bruna', phone: '(11) 98765-2002' });
  if (!lead.ok) throw new Error(lead.message);
  const k = chatKey('5511987652002');
  const conversa = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      phoneHash: conversationHash(k, tenant.id),
      phoneEncrypted: encrypt(k, OLD, tenant.id),
      lastPreviewEncrypted: encrypt('Oi!', OLD, tenant.id),
      lastMessageAt: new Date(),
    },
  });
  const mensagem = await prisma.chatMessage.create({
    data: {
      tenantId: tenant.id,
      conversationId: conversa.id,
      direction: 'INBOUND',
      origin: 'CONTACT',
      textEncrypted: encrypt('Quero marcar', OLD, tenant.id),
      externalId: `ROT${suffix}`,
      at: new Date(),
    },
  });

  // Passo 1 e 2 do roteiro: a antiga vira V1, a nova vira a atual (chave 2).
  Object.assign(process.env, { ENCRYPTION_MASTER_KEY_V1: OLD, ENCRYPTION_MASTER_KEY: NEW, ENCRYPTION_KEY_VERSION: '2' });

  afterAll(async () => {
    process.env = ambiente;
    const t = { tenantId: tenant.id };
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.patient.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('antes de recifrar, o que é da chave 1 continua sendo achado', async () => {
    expect(await findOpenLeadByPhone(db, tenant.id, '11987652002')).toMatchObject({ id: lead.leadId });
    expect(await cpfTaken(tenant.id, '529.982.247-25')).toBe(true);
    const achada = await db.conversation.findFirst({ where: { phoneHash: { in: conversationHashes(k, tenant.id) } } });
    expect(achada?.id).toBe(conversa.id);
  });

  it('o relógio recifra tudo com a chave 2 e refaz os índices', async () => {
    let rodada;
    do rodada = await reencryptWithCurrentKey({ tenantId: tenant.id });
    while (rodada.reencrypted > 0);
    expect(rodada.unreadable).toBe(0);

    const p = await prisma.patient.findUniqueOrThrow({ where: { id: paciente.id } });
    expect(keyVersionOf(p.cpfEncrypted!)).toBe(2);
    expect(keyVersionOf(p.phoneEncrypted)).toBe(2);
    expect(p.phone2Encrypted).toBeNull();
    expect(p.cpfHash).toBe(cpfHash('52998224725', tenant.id));
    expect(p.updatedAt).toEqual(paciente.updatedAt);

    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.leadId } });
    expect(keyVersionOf(l.phoneEncrypted)).toBe(2);

    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } });
    expect(c.phoneHash).toBe(conversationHash(k, tenant.id));
    expect(decrypt(c.lastPreviewEncrypted!, NEW, tenant.id)).toBe('Oi!');

    const m = await prisma.chatMessage.findUniqueOrThrow({ where: { id: mensagem.id } });
    expect(decrypt(m.textEncrypted!, NEW, tenant.id)).toBe('Quero marcar');
  });

  it('sem a chave antiga (passo 4), tudo continua abrindo e sendo achado', async () => {
    delete process.env.ENCRYPTION_MASTER_KEY_V1;
    expect(await findOpenLeadByPhone(db, tenant.id, '11987652002')).toMatchObject({ id: lead.leadId });
    expect(await cpfTaken(tenant.id, '52998224725')).toBe(true);
    const p = await prisma.patient.findUniqueOrThrow({ where: { id: paciente.id } });
    expect(decrypt(p.cpfEncrypted!, NEW, tenant.id)).toBe('52998224725');
    expect(decrypt(p.phoneEncrypted, NEW, tenant.id)).toBe('11987650000');
  });

  it('com a chave 1 ativa, a rodada não faz nada', async () => {
    process.env.ENCRYPTION_KEY_VERSION = '1';
    expect(await reencryptWithCurrentKey({ tenantId: tenant.id })).toEqual({ reencrypted: 0, unreadable: 0 });
    process.env.ENCRYPTION_KEY_VERSION = '2';
  });
});
