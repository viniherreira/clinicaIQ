import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** As ferramentas do assistente contra o banco de desenvolvimento, em duas clínicas descartáveis. */
const envFile = resolve(__dirname, '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('ferramentas do assistente (banco)', async () => {
  const { prisma, getTenantClient, encrypt } = await import('@clinicaiq/db');
  const key = process.env.ENCRYPTION_MASTER_KEY!;
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  async function clinica(nome: string) {
    const tenant = await prisma.tenant.create({ data: { clerkOrgId: `ia_${nome}_${sufixo}`, name: nome, slug: `ia-${nome}-${sufixo}` } });
    const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `${nome}-${sufixo}@teste.local`, role: 'OWNER' } });
    const prof = await prisma.professional.create({ data: { tenantId: tenant.id, name: `Dra. Ana ${nome}`, specialty: 'Ortodontia' } });
    return { tenant, user, prof, db: getTenantClient(tenant.id) };
  }
  const A = await clinica('a');
  const B = await clinica('b');
  const ctxA = { tenantId: A.tenant.id, userId: A.user.id, role: 'OWNER' as const, hoje: '2026-11-07', db: A.db };

  let ctl = 1;
  async function paciente(c: typeof A, nome: string) {
    return prisma.patient.create({
      data: { tenantId: c.tenant.id, controlNumber: ctl++, name: nome, phoneEncrypted: encrypt('11987654321', key, c.tenant.id) },
    });
  }
  async function consulta(c: typeof A, patientId: string, inicio: string, status: 'SCHEDULED' | 'ATTENDED' | 'CANCELLED' | 'MISSED') {
    const startTime = new Date(inicio);
    return prisma.appointment.create({
      data: { tenantId: c.tenant.id, patientId, professionalId: c.prof.id, startTime, endTime: new Date(startTime.getTime() + 30 * 60_000), status },
    });
  }

  afterAll(async () => {
    for (const c of [A, B]) {
      const t = { tenantId: c.tenant.id };
      await prisma.payment.deleteMany({ where: t });
      await prisma.quote.deleteMany({ where: t });
      await prisma.appointment.deleteMany({ where: t });
      await prisma.patient.deleteMany({ where: t });
      await prisma.professionalSchedule.deleteMany({ where: { professionalId: c.prof.id } });
      await prisma.professional.deleteMany({ where: t });
      await prisma.user.deleteMany({ where: t });
      await prisma.tenant.delete({ where: { id: c.tenant.id } });
    }
    await prisma.$disconnect();
  });

  describe('listarProfissionais', async () => {
    const { listarProfissionais } = await import('./profissionais');
    it('lista só os da clínica', async () => {
      const r = (await listarProfissionais.executar(ctxA, {})) as { itens: { nome: string }[] };
      expect(r.itens.map((p) => p.nome)).toEqual(['Dra. Ana a']);
    });
  });

  describe('buscarPacientes', async () => {
    const { buscarPacientes } = await import('./pacientes');
    const maria = await paciente(A, 'Maria Souza');
    await paciente(B, 'Maria da Clínica B');

    it('acha pelo nome, só na própria clínica, sem telefone por padrão', async () => {
      const r = (await buscarPacientes.executar(ctxA, { nome: 'maria' })) as { itens: Record<string, unknown>[] };
      expect(r.itens).toHaveLength(1);
      expect(r.itens[0]).toMatchObject({ id: maria.id, nome: 'Maria Souza' });
      expect(r.itens[0]).not.toHaveProperty('telefone');
    });

    it('decifra o telefone só quando pedido', async () => {
      const r = (await buscarPacientes.executar(ctxA, { ids: [maria.id], incluirContato: true })) as { itens: { telefone: string }[] };
      expect(r.itens[0].telefone).toBe('11987654321');
    });

    it('não devolve paciente de outra clínica nem pelo id', async () => {
      const deB = await prisma.patient.findFirst({ where: { tenantId: B.tenant.id } });
      const r = (await buscarPacientes.executar(ctxA, { ids: [deB!.id] })) as { itens: unknown[] };
      expect(r.itens).toEqual([]);
    });
  });

  // TAREFAS 6 A 13: novos blocos describe entram aqui, acima deste comentário.
});
