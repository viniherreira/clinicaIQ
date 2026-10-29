import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let logado: string | null = null;
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: logado }) }));

/**
 * Quem abriu o prontuário fica registrado (achado F-07 da auditoria). Antes só
 * as alterações iam para o registro: ler a anamnese de um vizinho não deixava
 * rastro. Abrir de novo logo em seguida não repete a linha (10 minutos).
 */
const envFile = resolve(__dirname, '..', '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('leitura do prontuário no registro (banco)', async () => {
  const { prisma, encrypt } = await import('@clinicaiq/db');
  const { getPatientRecord } = await import('./actions');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: {
      clerkOrgId: `leitura_${suffix}`,
      name: 'Leitura teste',
      slug: `leitura-${suffix}`,
      settings: { privacy: { receptionSeesRecord: false } },
    },
  });
  const pessoa = (nome: string, role: 'RECEPTIONIST' | 'PROFESSIONAL') =>
    prisma.user.create({
      data: { tenantId: tenant.id, clerkUserId: `user_${nome}_${suffix}`, name: nome, email: `${nome}-${suffix}@teste.local`, role },
    });
  const profissional = await pessoa('profissional', 'PROFESSIONAL');
  const recepcao = await pessoa('recepcao', 'RECEPTIONIST');
  const paciente = await prisma.patient.create({
    data: { tenantId: tenant.id, controlNumber: 1, name: 'Paciente', phoneEncrypted: encrypt('11987650000', process.env.ENCRYPTION_MASTER_KEY!, tenant.id), lgpdConsentAt: new Date() },
  });
  const leituras = (userId: string) =>
    prisma.auditLog.count({ where: { tenantId: tenant.id, userId, action: 'RECORD_VIEWED', entityId: paciente.id } });

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.auditLog.deleteMany({ where: t });
    await prisma.patient.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('abrir o prontuário fica registrado, uma vez a cada 10 minutos', async () => {
    logado = profissional.clerkUserId;
    await getPatientRecord(paciente.id);
    await getPatientRecord(paciente.id);
    expect(await leituras(profissional.id)).toBe(1);
  });

  it('quem não vê o prontuário não gera leitura', async () => {
    logado = recepcao.clerkUserId;
    await getPatientRecord(paciente.id);
    expect(await leituras(recepcao.id)).toBe(0);
  });
});
