import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** Cada chamada vem de um IP diferente: o limite por IP não entra no caminho. */
let ip = 0;
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': `203.0.113.${(ip++ % 250) + 1}` }),
}));

/**
 * Travas do agendamento online (achado F-05 da auditoria).
 *
 * A página é pública e cada envio cria paciente, consulta e uma mensagem de
 * WhatsApp da clínica para o número digitado. Com IPs variados, o limite por IP
 * não segura: um script lotava a agenda e fazia a clínica mandar mensagem para
 * números de estranhos. Agora há teto por clínica (por dia) e por telefone.
 */
const envFile = resolve(__dirname, '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('bookOnline: travas (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { bookOnline } = await import('./actions');
  const { ONLINE_BOOKING_DAILY_CAP } = await import('@/lib/availability');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const clinica = async (nome: string) =>
    prisma.tenant.create({
      data: {
        clerkOrgId: `agendar_${nome}_${suffix}`,
        name: `Agendar ${nome}`,
        slug: `agendar-${nome}-${suffix}`,
        settings: { onlineBooking: { enabled: true } },
      },
    });
  const cheia = await clinica('cheia');
  const livre = await clinica('livre');

  const pedido = (fone: string) => ({
    professionalId: 'qualquer',
    procedureId: null,
    date: '2099-01-05',
    time: '09:00',
    name: 'Pessoa de Teste',
    phone: fone,
    consent: true as const,
  });

  afterAll(async () => {
    for (const t of [cheia, livre]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: t.id } });
      await prisma.clinicUnit.deleteMany({ where: { tenantId: t.id } });
      await prisma.$executeRaw`DELETE FROM "rate_limits" WHERE "key" LIKE ${`%${t.id}%`}`;
      await prisma.tenant.delete({ where: { id: t.id } });
    }
  });

  it('para quando a clínica já recebeu o teto do dia', async () => {
    await prisma.auditLog.createMany({
      data: Array.from({ length: ONLINE_BOOKING_DAILY_CAP }, (_, i) => ({
        tenantId: cheia.id,
        action: 'ONLINE_BOOKING',
        entity: 'Appointment',
        entityId: `teste-${i}`,
      })),
    });
    const r = await bookOnline(cheia.slug, pedido('11987650001'));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain('limite de hoje');
  });

  it('para o mesmo WhatsApp depois de 3 pedidos no dia', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await bookOnline(livre.slug, pedido('11987650002'));
      expect(r.ok === false && r.message).not.toContain('muitos pedidos');
    }
    const quarto = await bookOnline(livre.slug, pedido('(11) 98765-0002'));
    expect(quarto.ok).toBe(false);
    expect(quarto.ok === false && quarto.message).toContain('muitos pedidos');
  });
});
