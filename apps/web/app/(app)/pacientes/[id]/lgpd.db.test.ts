import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

let logado: string | null = null;
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: logado }) }));

/**
 * Direitos do titular (achado F-07 da auditoria, LGPD art. 18): a clínica
 * consegue entregar ao paciente tudo o que tem dele e anonimizar o cadastro.
 * O conteúdo clínico fica, pelo prazo legal de guarda do prontuário.
 */
const envFile = resolve(__dirname, '..', '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('exportar e anonimizar paciente (banco)', async () => {
  const { prisma, encrypt, decrypt, getTenantClient } = await import('@clinicaiq/db');
  const { GET: exportar } = await import('./exportar/route');
  const { anonymizePatientAction } = await import('./actions');
  const { ensureDefaultPipeline } = await import('@/crm/pipeline');
  const { createLead } = await import('@/crm/leads');
  const { ERASED_NAME } = await import('@/crm/anonymize');

  const key = process.env.ENCRYPTION_MASTER_KEY!;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const clinica = (nome: string) =>
    prisma.tenant.create({ data: { clerkOrgId: `lgpd_${nome}_${suffix}`, name: `LGPD ${nome}`, slug: `lgpd-${nome}-${suffix}` } });
  const tenant = await clinica('a');
  const outra = await clinica('b');
  await prisma.subscription.create({
    data: { tenantId: tenant.id, tier: 'CLINICA', status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01') },
  });
  const pessoa = (nome: string, role: 'OWNER' | 'RECEPTIONIST') =>
    prisma.user.create({
      data: { tenantId: tenant.id, clerkUserId: `user_${nome}_${suffix}`, name: nome, email: `${nome}-${suffix}@teste.local`, role },
    });
  const dono = await pessoa('dono', 'OWNER');
  const recepcao = await pessoa('recepcao', 'RECEPTIONIST');

  const paciente = await prisma.patient.create({
    data: {
      tenantId: tenant.id,
      controlNumber: 7,
      name: 'Joana Titular',
      cpfEncrypted: encrypt('52998224725', key, tenant.id),
      phoneEncrypted: encrypt('11987650007', key, tenant.id),
      email: 'joana@teste.local',
      street: 'Rua das Flores',
      lgpdConsentAt: new Date(),
    },
  });
  const deFora = await prisma.patient.create({
    data: { tenantId: outra.id, controlNumber: 1, name: 'De Fora', phoneEncrypted: encrypt('11900000000', key, outra.id), lgpdConsentAt: new Date() },
  });
  await prisma.anamnesis.create({ data: { tenantId: tenant.id, patientId: paciente.id, answers: { alergias: 'dipirona' } } });
  await prisma.evolution.create({ data: { tenantId: tenant.id, patientId: paciente.id, description: 'Restauração no 16.', createdById: dono.id } });
  await prisma.patientNote.create({ data: { tenantId: tenant.id, patientId: paciente.id, userId: dono.id, content: 'Mora com a mãe na Rua das Flores.' } });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  const lead = await createLead(db, { tenantId: tenant.id, userId: dono.id }, { name: 'Joana Titular', phone: '11987650007', patientId: paciente.id });
  if (!lead.ok) throw new Error(lead.message);

  const baixar = (id: string) => exportar(new Request(`http://localhost/pacientes/${id}/exportar`), { params: Promise.resolve({ id }) });

  afterAll(async () => {
    for (const t of [tenant, outra]) {
      const w = { tenantId: t.id };
      await prisma.auditLog.deleteMany({ where: w });
      await prisma.patientNote.deleteMany({ where: w });
      await prisma.evolution.deleteMany({ where: w });
      await prisma.anamnesis.deleteMany({ where: w });
      await prisma.conversation.deleteMany({ where: w });
      await prisma.leadActivity.deleteMany({ where: w });
      await prisma.leadTask.deleteMany({ where: w });
      await prisma.lead.deleteMany({ where: w });
      await prisma.pipelineStage.deleteMany({ where: w });
      await prisma.pipeline.deleteMany({ where: w });
      await prisma.lostReason.deleteMany({ where: w });
      await prisma.patient.deleteMany({ where: w });
      await prisma.user.deleteMany({ where: w });
      await prisma.subscription.deleteMany({ where: w });
      await prisma.tenant.delete({ where: { id: t.id } });
    }
  });

  it('a recepção não exporta', async () => {
    logado = recepcao.clerkUserId;
    expect((await baixar(paciente.id)).status).toBe(403);
  });

  it('não exporta paciente de outra clínica', async () => {
    logado = dono.clerkUserId;
    expect((await baixar(deFora.id)).status).toBe(404);
  });

  it('o dono exporta tudo o que a clínica tem do paciente', async () => {
    logado = dono.clerkUserId;
    const r = await baixar(paciente.id);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('attachment');
    const dados = await r.json();
    expect(dados.paciente.nome).toBe('Joana Titular');
    expect(dados.paciente.cpf).toBe('52998224725');
    expect(dados.paciente.telefone).toBe('11987650007');
    expect(dados.anamnese).toEqual({ alergias: 'dipirona' });
    expect(dados.evolucoes[0].texto).toBe('Restauração no 16.');
    expect(dados.crm.negocios).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'PATIENT_EXPORTED' } })).toBe(1);
  });

  it('anonimizar exige o perfil de privacidade e a palavra de confirmação', async () => {
    logado = recepcao.clerkUserId;
    expect((await anonymizePatientAction(paciente.id, 'ANONIMIZAR')).ok).toBe(false);
    logado = dono.clerkUserId;
    expect((await anonymizePatientAction(paciente.id, 'sim')).ok).toBe(false);
    expect((await prisma.patient.findUnique({ where: { id: paciente.id } }))!.name).toBe('Joana Titular');
  });

  it('anonimiza o cadastro, apaga notas e CRM, e guarda o prontuário', async () => {
    logado = dono.clerkUserId;
    expect((await anonymizePatientAction(paciente.id, 'anonimizar')).ok).toBe(true);
    const p = (await prisma.patient.findUnique({ where: { id: paciente.id } }))!;
    expect(p.name).toBe('Paciente anonimizado nº 7');
    expect(p.cpfEncrypted).toBeNull();
    expect(p.email).toBeNull();
    expect(p.street).toBeNull();
    expect(decrypt(p.phoneEncrypted, key, tenant.id)).toBe('');
    expect(await prisma.patientNote.count({ where: { patientId: paciente.id } })).toBe(0);
    expect(await prisma.evolution.count({ where: { patientId: paciente.id } })).toBe(1);
    expect(await prisma.anamnesis.count({ where: { patientId: paciente.id } })).toBe(1);
    expect((await prisma.lead.findFirst({ where: { id: lead.leadId } }))?.name).toBe(ERASED_NAME);
    expect(await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'PATIENT_ANONYMIZED' } })).toBe(1);
  });

  it('não anonimiza duas vezes', async () => {
    logado = dono.clerkUserId;
    expect((await anonymizePatientAction(paciente.id, 'ANONIMIZAR')).ok).toBe(false);
  });
});
