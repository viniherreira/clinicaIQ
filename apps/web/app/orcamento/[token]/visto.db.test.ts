import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Abrir o link do orçamento não muda nada sozinho (achado F-13 da auditoria).
 *
 * A página marcava "Visualizado" já no carregamento, no servidor. O WhatsApp
 * abre o link para montar a pré-visualização assim que a clínica envia: o
 * orçamento aparecia como visto sem o paciente ter aberto. Agora quem marca é
 * o navegador do paciente, depois que a página abriu nele.
 */
const envFile = resolve(__dirname, '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('orçamento público: visualizado (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { getPublicQuote, markPublicQuoteViewed } = await import('./actions');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `visto_${suffix}`, name: 'Visto teste', slug: `visto-${suffix}` },
  });
  const paciente = await prisma.patient.create({
    data: { tenantId: tenant.id, controlNumber: 1, name: 'Paciente', phoneEncrypted: 'x', lgpdConsentAt: new Date() },
  });
  const orcamento = (n: number, validUntil: Date) =>
    prisma.quote.create({
      data: {
        tenantId: tenant.id,
        patientId: paciente.id,
        number: n,
        publicToken: `tok_${suffix}_${n}`,
        status: 'SENT',
        subtotal: 100,
        total: 100,
        validUntil,
      },
    });
  const emDia = await orcamento(1, new Date(Date.now() + 7 * 86_400_000));
  const vencido = await orcamento(2, new Date(Date.now() - 86_400_000));
  const statusDe = async (id: string) => (await prisma.quote.findUnique({ where: { id } }))!.status;

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.patient.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('carregar a página não marca como visualizado', async () => {
    const q = await getPublicQuote(emDia.publicToken);
    expect(q?.status).toBe('SENT');
    expect(await statusDe(emDia.id)).toBe('SENT');
  });

  it('o navegador do paciente marca como visualizado', async () => {
    await markPublicQuoteViewed(emDia.publicToken);
    expect(await statusDe(emDia.id)).toBe('VIEWED');
  });

  it('vencido aparece como expirado, sem gravar nada ao abrir', async () => {
    const q = await getPublicQuote(vencido.publicToken);
    expect(q?.status).toBe('EXPIRED');
    expect(await statusDe(vencido.id)).toBe('SENT');
  });
});
