import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

/** Quem o Clerk diz que está logado. Trocado em cada teste. */
let logado: string | null = null;
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: logado }) }));

/**
 * Notas da equipe na ficha do paciente (achado F-04 da auditoria).
 *
 * `addPatientNote` é Server Action: endereço público, chamado com qualquer id.
 * Gravava a nota com o `tenantId` de quem chamou e o `patientId` que viesse — a
 * FK só exige que o paciente exista em alguma clínica, e o `include` da ficha
 * segue a FK sem olhar a clínica. Uma clínica escrevia na ficha da outra.
 */
const envFile = resolve(__dirname, '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('notas do paciente (banco)', async () => {
  const { prisma, encrypt } = await import('@clinicaiq/db');
  const { addPatientNote, getPatient } = await import('./actions');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const clinica = async (nome: string) => {
    const tenant = await prisma.tenant.create({
      data: { clerkOrgId: `notas_${nome}_${suffix}`, name: `Notas ${nome}`, slug: `notas-${nome}-${suffix}` },
    });
    await prisma.subscription.create({
      data: { tenantId: tenant.id, tier: 'CLINICA', status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01') },
    });
    const clerkUserId = `user_notas_${nome}_${suffix}`;
    await prisma.user.create({
      data: { tenantId: tenant.id, clerkUserId, name: `Equipe ${nome}`, email: `${nome}-${suffix}@teste.local`, role: 'RECEPTIONIST' },
    });
    const paciente = await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        controlNumber: 1,
        name: `Paciente ${nome}`,
        phoneEncrypted: encrypt('11987650000', process.env.ENCRYPTION_MASTER_KEY!, tenant.id),
        lgpdConsentAt: new Date(),
      },
    });
    return { tenant, clerkUserId, paciente };
  };
  const a = await clinica('a');
  const b = await clinica('b');
  const notasDe = (patientId: string) => prisma.patientNote.findMany({ where: { patientId } });

  afterAll(async () => {
    for (const c of [a, b]) {
      const t = { tenantId: c.tenant.id };
      await prisma.patientNote.deleteMany({ where: { OR: [t, { patientId: c.paciente.id }] } });
      await prisma.auditLog.deleteMany({ where: t });
    }
    for (const c of [a, b]) {
      const t = { tenantId: c.tenant.id };
      await prisma.patient.deleteMany({ where: t });
      await prisma.user.deleteMany({ where: t });
      await prisma.subscription.deleteMany({ where: t });
      await prisma.tenant.delete({ where: { id: c.tenant.id } });
    }
  });

  it('grava a nota no paciente da própria clínica', async () => {
    logado = a.clerkUserId;
    await addPatientNote(a.paciente.id, 'Prefere horário da manhã.');
    const notas = await notasDe(a.paciente.id);
    expect(notas).toHaveLength(1);
    expect(notas[0].tenantId).toBe(a.tenant.id);
  });

  it('não grava nota no paciente de outra clínica', async () => {
    logado = a.clerkUserId;
    await addPatientNote(b.paciente.id, 'Paciente com dívida, não atender.');
    expect(await notasDe(b.paciente.id)).toHaveLength(0);
  });

  it('corta o texto em 2.000 caracteres', async () => {
    logado = a.clerkUserId;
    await addPatientNote(a.paciente.id, 'x'.repeat(5000));
    const maior = Math.max(...(await notasDe(a.paciente.id)).map((n) => n.content.length));
    expect(maior).toBe(2000);
  });

  it('a ficha não mostra nota gravada por outra clínica', async () => {
    // Linha que a falha deixou no banco antes da correção.
    const intrusa = await prisma.user.findFirstOrThrow({ where: { clerkUserId: a.clerkUserId } });
    await prisma.patientNote.create({
      data: { tenantId: a.tenant.id, patientId: b.paciente.id, userId: intrusa.id, content: 'Escrita de fora.' },
    });
    logado = b.clerkUserId;
    const ficha = await getPatient(b.paciente.id);
    expect(ficha?.patientNotes.map((n) => n.content)).not.toContain('Escrita de fora.');
  });
});
