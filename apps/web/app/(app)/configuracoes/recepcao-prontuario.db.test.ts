import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let logado: string | null = null;
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: logado }),
  clerkClient: async () => ({}),
}));

/**
 * A recepção vê o prontuário só se a clínica escolher (achado F-07 da
 * auditoria). Vale na ação, não só na tela: Server Action é endereço público.
 */
const envFile = resolve(__dirname, '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('recepção e prontuário (banco)', async () => {
  const { prisma, encrypt } = await import('@clinicaiq/db');
  const { getPatientRecord, addEvolution } = await import('../pacientes/[id]/actions');
  const { savePrivacySettings, getPrivacySummary } = await import('./actions');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `prontu_${suffix}`, name: 'Prontuário teste', slug: `prontu-${suffix}` },
  });
  await prisma.subscription.create({
    data: { tenantId: tenant.id, tier: 'CLINICA', status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01') },
  });
  const pessoa = (nome: string, role: 'OWNER' | 'RECEPTIONIST' | 'PROFESSIONAL') =>
    prisma.user.create({
      data: { tenantId: tenant.id, clerkUserId: `user_${nome}_${suffix}`, name: nome, email: `${nome}-${suffix}@teste.local`, role },
    });
  const dono = await pessoa('dono', 'OWNER');
  const recepcao = await pessoa('recepcao', 'RECEPTIONIST');
  const profissional = await pessoa('profissional', 'PROFESSIONAL');
  const paciente = await prisma.patient.create({
    data: { tenantId: tenant.id, controlNumber: 1, name: 'Paciente', phoneEncrypted: encrypt('11987650000', process.env.ENCRYPTION_MASTER_KEY!, tenant.id), lgpdConsentAt: new Date() },
  });
  await prisma.anamnesis.create({ data: { tenantId: tenant.id, patientId: paciente.id, answers: { alergias: 'penicilina' } } });

  const como = (u: { clerkUserId: string | null }) => {
    logado = u.clerkUserId;
  };
  const evolucao = () => addEvolution(paciente.id, { description: 'Limpeza feita.' });

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.auditLog.deleteMany({ where: t });
    await prisma.evolution.deleteMany({ where: t });
    await prisma.anamnesis.deleteMany({ where: t });
    await prisma.patient.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.subscription.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('clínica que nunca escolheu: a recepção continua vendo', async () => {
    como(recepcao);
    const r = await getPatientRecord(paciente.id);
    expect(r.canSeeRecord).toBe(true);
    expect(r.anamnesis).not.toBeNull();
  });

  it('a recepção não muda a opção', async () => {
    como(recepcao);
    const r = await savePrivacySettings({ receptionSeesRecord: false });
    expect(r.ok).toBe(false);
  });

  it('o dono fecha: a recepção deixa de ler e de escrever no prontuário', async () => {
    como(dono);
    expect((await savePrivacySettings({ receptionSeesRecord: false })).ok).toBe(true);
    expect((await getPrivacySummary()).receptionSeesRecord).toBe(false);

    como(recepcao);
    const r = await getPatientRecord(paciente.id);
    expect(r.canSeeRecord).toBe(false);
    expect(r.anamnesis).toBeNull();
    const escrita = await evolucao();
    expect(escrita.ok).toBe(false);
  });

  it('com a recepção fechada, o profissional continua no prontuário', async () => {
    como(profissional);
    expect((await getPatientRecord(paciente.id)).canSeeRecord).toBe(true);
    expect((await evolucao()).ok).toBe(true);
  });
});
