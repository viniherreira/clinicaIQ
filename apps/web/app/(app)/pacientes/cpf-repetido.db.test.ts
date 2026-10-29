import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: () => undefined,
}));

let logado: string | null = null;
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: logado }) }));

/**
 * CPF repetido na mesma clínica (achado F-15 da auditoria).
 *
 * O CPF é cifrado com IV aleatório: comparar `cpfEncrypted` com um `encrypt()`
 * novo nunca dá igual, então "CPF já cadastrado" nunca disparava. A conferência
 * passa a usar o índice cego (`cpfHash`).
 */
const envFile = resolve(__dirname, '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('CPF repetido (banco)', async () => {
  const { prisma, encrypt } = await import('@clinicaiq/db');
  const { createPatient, updatePatient } = await import('./actions');
  const { fillMissingCpfHashes } = await import('@/lib/cpf-hash');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const clinica = async (nome: string) => {
    const tenant = await prisma.tenant.create({
      data: { clerkOrgId: `cpf_${nome}_${suffix}`, name: `CPF ${nome}`, slug: `cpf-${nome}-${suffix}` },
    });
    await prisma.subscription.create({
      data: { tenantId: tenant.id, tier: 'CLINICA', status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01') },
    });
    const clerkUserId = `user_cpf_${nome}_${suffix}`;
    await prisma.user.create({
      data: { tenantId: tenant.id, clerkUserId, name: `Equipe ${nome}`, email: `${nome}-${suffix}@teste.local`, role: 'OWNER' },
    });
    return { tenant, clerkUserId };
  };
  const a = await clinica('a');
  const b = await clinica('b');

  afterAll(async () => {
    for (const c of [a, b]) {
      const t = { tenantId: c.tenant.id };
      await prisma.auditLog.deleteMany({ where: t });
      await prisma.patient.deleteMany({ where: t });
      await prisma.user.deleteMany({ where: t });
      await prisma.subscription.deleteMany({ where: t });
      await prisma.tenant.delete({ where: { id: c.tenant.id } });
    }
  });

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: 'Paciente', phone: '11987650000', lgpdConsent: 'on', ...campos })) fd.set(k, v);
    return fd;
  };

  it('recusa o mesmo CPF duas vezes, com ou sem máscara', async () => {
    logado = a.clerkUserId;
    const primeiro = await createPatient(null, form({ name: 'Ana', cpf: '529.982.247-25' }));
    expect(primeiro.success).toBe(true);

    const segundo = await createPatient(null, form({ name: 'Ana de novo', cpf: '52998224725' }));
    expect(segundo).toMatchObject({ success: false, errors: { cpf: ['CPF já cadastrado nesta clínica'] } });
  });

  it('o mesmo CPF em outra clínica é permitido', async () => {
    logado = b.clerkUserId;
    const r = await createPatient(null, form({ name: 'Ana', cpf: '52998224725' }));
    expect(r.success).toBe(true);
  });

  it('não deixa trocar o CPF para o de outro paciente da clínica', async () => {
    logado = a.clerkUserId;
    const outro = await createPatient(null, form({ name: 'Bruno', cpf: '11144477735' }));
    expect(outro.success).toBe(true);
    if (!outro.success) return;

    const r = await updatePatient(outro.patientId, null, form({ name: 'Bruno', cpf: '529.982.247-25' }));
    expect(r).toMatchObject({ success: false, errors: { cpf: ['CPF já cadastrado nesta clínica'] } });

    // Salvar o próprio CPF de novo não é repetido.
    const mesmo = await updatePatient(outro.patientId, null, form({ name: 'Bruno Silva', cpf: '11144477735' }));
    expect(mesmo.success).toBe(true);
  });

  it('paciente antigo, ainda sem cpfHash, também conta como repetido', async () => {
    const antigo = await prisma.patient.create({
      data: {
        tenantId: a.tenant.id,
        controlNumber: 900,
        name: 'Carla (antiga)',
        cpfEncrypted: encrypt('39053344705', process.env.ENCRYPTION_MASTER_KEY!, a.tenant.id),
        phoneEncrypted: encrypt('11987650001', process.env.ENCRYPTION_MASTER_KEY!, a.tenant.id),
        lgpdConsentAt: new Date(),
      },
    });
    expect(antigo.cpfHash).toBeNull();

    logado = a.clerkUserId;
    const r = await createPatient(null, form({ name: 'Carla', cpf: '390.533.447-05' }));
    expect(r).toMatchObject({ success: false, errors: { cpf: ['CPF já cadastrado nesta clínica'] } });
  });

  it('o preenchimento em lote dá cpfHash aos pacientes antigos', async () => {
    await fillMissingCpfHashes();
    const faltam = await prisma.patient.count({
      where: { tenantId: { in: [a.tenant.id, b.tenant.id] }, cpfEncrypted: { not: null }, cpfHash: null },
    });
    expect(faltam).toBe(0);

    const ana = await prisma.patient.findMany({
      where: { tenantId: { in: [a.tenant.id, b.tenant.id] }, name: 'Ana' },
      select: { cpfHash: true },
    });
    // Por clínica: o mesmo CPF em duas clínicas dá dois códigos diferentes.
    expect(new Set(ana.map((p) => p.cpfHash)).size).toBe(2);
  });
});
