import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** O que o Asaas responde quando o webhook consulta a cobrança. Trocado em cada teste. */
let noAsaas: { status: string; value: number; deleted?: boolean } | 'fora-do-ar' = 'fora-do-ar';
vi.mock('@/lib/asaas', async (original) => {
  const real = await original<typeof import('@/lib/asaas')>();
  return {
    ...real,
    getPayment: async (id: string) => {
      if (noAsaas === 'fora-do-ar') throw new real.AsaasError('Asaas respondeu 502.', 502);
      return { id, dueDate: '2026-10-10', ...noAsaas };
    },
  };
});

/**
 * O webhook do Asaas confere a cobrança no próprio Asaas (achado F-09 da
 * auditoria). Antes ele acreditava no corpo do aviso: com o token do webhook
 * vazado, um POST dizendo "pago" liberava o plano de qualquer clínica. Agora
 * a situação e o valor vêm da API do Asaas.
 */
const envFile = resolve(__dirname, '..', '..', '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('webhook do Asaas (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { POST } = await import('./route');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `asaas_${suffix}`, name: 'Asaas teste', slug: `asaas-${suffix}` },
  });
  const assinatura = await prisma.subscription.create({
    data: { tenantId: tenant.id, tier: 'CLINICA', status: 'PAST_DUE', currentPeriodEnd: new Date('2026-10-10'), asaasSubscriptionId: `sub_${suffix}` },
  });
  const cobranca = await prisma.charge.create({
    data: { tenantId: tenant.id, subscriptionId: assinatura.id, asaasChargeId: `pay_${suffix}`, amountCents: 13900, status: 'OVERDUE', dueDate: new Date('2026-10-10') },
  });

  const avisoDePago = () =>
    POST(
      new Request('http://localhost/api/webhooks/asaas', {
        method: 'POST',
        headers: { 'asaas-access-token': 'token-do-webhook', 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: cobranca.asaasChargeId, status: 'RECEIVED', value: 139, dueDate: '2026-10-10' } }),
      }),
    );
  const situacao = async () => ({
    assinatura: (await prisma.subscription.findUnique({ where: { id: assinatura.id } }))!.status,
    cobranca: (await prisma.charge.findUnique({ where: { id: cobranca.id } }))!.status,
  });

  beforeEach(async () => {
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', 'token-do-webhook');
    await prisma.subscription.update({ where: { id: assinatura.id }, data: { status: 'PAST_DUE' } });
    await prisma.charge.update({ where: { id: cobranca.id }, data: { status: 'OVERDUE', paidAt: null } });
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await prisma.charge.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('não libera o plano quando o Asaas diz que a cobrança não foi paga', async () => {
    noAsaas = { status: 'OVERDUE', value: 139 };
    await avisoDePago();
    expect(await situacao()).toEqual({ assinatura: 'PAST_DUE', cobranca: 'OVERDUE' });
  });

  it('não libera o plano quando o valor pago é menor que o da cobrança', async () => {
    noAsaas = { status: 'RECEIVED', value: 1 };
    await avisoDePago();
    expect((await situacao()).assinatura).toBe('PAST_DUE');
  });

  it('com o Asaas fora do ar, não muda nada e pede para tentar de novo', async () => {
    noAsaas = 'fora-do-ar';
    const r = await avisoDePago();
    expect(r.status).toBe(503);
    expect(await situacao()).toEqual({ assinatura: 'PAST_DUE', cobranca: 'OVERDUE' });
  });

  it('libera quando o Asaas confirma o pagamento com o valor certo', async () => {
    noAsaas = { status: 'RECEIVED', value: 139 };
    await avisoDePago();
    expect(await situacao()).toEqual({ assinatura: 'ACTIVE', cobranca: 'PAID' });
  });
});
