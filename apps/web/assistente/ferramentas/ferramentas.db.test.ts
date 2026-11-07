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

  describe('ultimosAtendidos', async () => {
    const { ultimosAtendidos } = await import('./atendidos');
    const p1 = await paciente(A, 'Atendido Antigo');
    const p2 = await paciente(A, 'Atendido Recente');
    await consulta(A, p1.id, '2026-10-01T09:00:00.000Z', 'ATTENDED');
    await consulta(A, p2.id, '2026-11-05T14:30:00.000Z', 'ATTENDED');
    await consulta(A, p2.id, '2026-11-06T10:00:00.000Z', 'CANCELLED');

    it('traz os atendidos, do mais recente, e ignora cancelados', async () => {
      const r = (await ultimosAtendidos.executar(ctxA, { quantidade: 5 })) as { itens: { paciente: string; data: string; hora: string }[] };
      const meus = r.itens.filter((i) => i.paciente.startsWith('Atendido'));
      expect(meus.map((i) => i.paciente)).toEqual(['Atendido Recente', 'Atendido Antigo']);
      expect(meus[0]).toMatchObject({ data: '2026-11-05', hora: '14:30' });
    });
  });

  describe('agendaDoDia', async () => {
    const { agendaDoDia } = await import('./agenda-do-dia');
    const p = await paciente(A, 'Da Agenda');
    await consulta(A, p.id, '2026-11-08T09:00:00.000Z', 'SCHEDULED');
    await consulta(A, p.id, '2026-11-08T11:00:00.000Z', 'CANCELLED');
    await consulta(A, p.id, '2026-11-09T09:00:00.000Z', 'SCHEDULED');
    const pB = await paciente(B, 'Da Agenda B');
    await consulta(B, pB.id, '2026-11-08T10:00:00.000Z', 'SCHEDULED');

    it('conta só os do dia, sem cancelados, só da clínica', async () => {
      const r = (await agendaDoDia.executar(ctxA, { data: '2026-11-08' })) as { total: number; itens: { hora: string }[] };
      expect(r.total).toBe(1);
      expect(r.itens[0].hora).toBe('09:00');
    });
  });

  describe('horariosLivres', async () => {
    const { horariosLivres } = await import('./horarios-livres');
    await prisma.professionalSchedule.create({
      data: { professionalId: A.prof.id, dayOfWeek: 1, startTime: '08:00', endTime: '10:00' },
    });
    const p = await paciente(A, 'Ocupa Horário');
    await consulta(A, p.id, '2030-01-07T08:30:00.000Z', 'SCHEDULED');

    it('devolve o expediente menos o ocupado', async () => {
      const r = (await horariosLivres.executar(ctxA, { profissionalId: A.prof.id, data: '2030-01-07' })) as { horarios: string[] };
      expect(r.horarios).toEqual(['08:00', '09:00', '09:30']);
    });

    it('recusa profissional de outra clínica', async () => {
      const r = (await horariosLivres.executar(ctxA, { profissionalId: B.prof.id, data: '2030-01-07' })) as { erro: string };
      expect(r.erro).toMatch(/não encontrado/);
    });
  });

  describe('cancelamentos', async () => {
    const { cancelamentos } = await import('./cancelamentos');
    const p = await paciente(A, 'Cancela Muito');
    await consulta(A, p.id, '2026-09-01T09:00:00.000Z', 'CANCELLED');
    await consulta(A, p.id, '2026-09-08T09:00:00.000Z', 'CANCELLED');
    await consulta(A, p.id, '2026-09-15T09:00:00.000Z', 'MISSED');
    const q = await paciente(A, 'Cancela Pouco');
    await consulta(A, q.id, '2026-09-01T10:00:00.000Z', 'CANCELLED');

    it('lista quem passou do mínimo, somando cancelado e falta', async () => {
      const r = (await cancelamentos.executar(ctxA, { minimo: 3 })) as { itens: { paciente: string; cancelados: number; faltas: number; total: number }[] };
      expect(r.itens).toEqual([expect.objectContaining({ paciente: 'Cancela Muito', cancelados: 2, faltas: 1, total: 3 })]);
    });
  });

  // TAREFAS 6 A 13: novos blocos describe entram aqui, acima deste comentário.
});
