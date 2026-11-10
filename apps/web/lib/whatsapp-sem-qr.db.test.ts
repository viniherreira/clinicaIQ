import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

/**
 * A agenda depois da saída do QR code: sem a API oficial, ela avisa que o
 * WhatsApp não está conectado (nada de "serviço fora do ar"); a mensagem de
 * aniversário, que só saía pelo QR, não sai e diz por quê.
 */
describe.skipIf(!process.env.DATABASE_URL)('WhatsApp da agenda sem o QR (banco)', async () => {
  const { prisma, encrypt } = await import('@clinicaiq/db');
  const { getWhatsAppHealth, dispatchBirthdayMessage } = await import('./whatsapp');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `wq_${suffix}`, name: 'Sem QR', slug: `wq-${suffix}` } });
  // Sessão antiga do QR "conectada": não pode mais valer de nada.
  await prisma.whatsAppSession.create({ data: { tenantId: tenant.id, status: 'CONNECTED', notifyBirthday: true } });
  const paciente = await prisma.patient.create({
    data: {
      tenantId: tenant.id,
      controlNumber: 1,
      name: 'Ana Souza',
      phoneEncrypted: encrypt('11987650000', process.env.ENCRYPTION_MASTER_KEY!, tenant.id),
      lgpdConsentAt: new Date(),
    },
  });

  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.whatsAppMessage.deleteMany({ where: t });
    await prisma.patient.deleteMany({ where: t });
    await prisma.whatsAppSession.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('sem a API oficial, em produção: pede para conectar, mesmo com a sessão antiga do QR "conectada"', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WHATSAPP_PROVIDER', 'mock');
    const h = await getWhatsAppHealth(tenant.id);
    expect(h).toMatchObject({ paired: false, connected: false });
    expect(h.problem).toContain('Conecte o número na tela WhatsApp');
  });

  it('aniversário ligado: não sai e diz por quê, sem gravar mensagem', async () => {
    expect(await dispatchBirthdayMessage(paciente.id)).toEqual({ success: false, error: 'birthday-unavailable' });
    expect(await prisma.whatsAppMessage.count({ where: { tenantId: tenant.id } })).toBe(0);
  });
});
