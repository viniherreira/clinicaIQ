import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

/** O adicional pago contra o banco de desenvolvimento, com o Asaas simulado. */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('CRM adicional (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { turnOnCrm, turnOffCrm, setCrmSeat, syncBillingValue, loadCrmAddon } = await import('./addon');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `addon_${suffix}`, name: 'Adicional', slug: `addon-${suffix}` } });
  const sub = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      tier: 'PROFISSIONAL',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2099-01-01'),
      asaasSubscriptionId: `sub_test_${suffix}`,
    },
  });
  const mk = (name: string, role: 'OWNER' | 'RECEPTIONIST' | 'PROFESSIONAL') =>
    prisma.user.create({ data: { tenantId: tenant.id, name, email: `${name}-${suffix}@teste.local`, role } });
  const dono = await mk('dono', 'OWNER');
  const recepcao = await mk('recepcao', 'RECEPTIONIST');
  const dentista = await mk('dentista', 'PROFESSIONAL');

  const enviados: { value: number; description: string }[] = [];
  const asaas = {
    configured: () => true,
    updateValue: vi.fn(async (_id: string, value: number, _plan: string, description: string) => {
      enviados.push({ value, description });
    }),
  };

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('primeira vez: 14 dias grátis, e quem ligou ganha acesso', async () => {
    const agora = new Date();
    expect(await turnOnCrm(tenant.id, dono.id, agora)).toEqual({ ok: true, mode: 'trial' });
    const s = await prisma.subscription.findUnique({ where: { id: sub.id } });
    expect(s?.crmEnabled).toBe(true);
    expect(Math.round((s!.crmTrialEndsAt!.getTime() - agora.getTime()) / 86_400_000)).toBe(14);
    expect((await prisma.user.findUnique({ where: { id: dono.id } }))?.crmSeat).toBe(true);
  });

  it('no teste, o Asaas recebe só o valor do plano', async () => {
    expect(await syncBillingValue(tenant.id, asaas)).toEqual({ sent: true, valueCents: 19_700 });
    expect(await syncBillingValue(tenant.id, asaas)).toEqual({ sent: false, reason: 'unchanged' });
  });

  it('profissional não ganha acesso; recepção ganha', async () => {
    expect((await setCrmSeat(tenant.id, dono.id, dentista.id, true)).ok).toBe(false);
    expect(await setCrmSeat(tenant.id, dono.id, recepcao.id, true)).toEqual({ ok: true });
  });

  it('acabou o teste: plano + R$ 39 × 2, com a descrição na fatura', async () => {
    const depois = new Date(Date.now() + 15 * 86_400_000);
    expect(await syncBillingValue(tenant.id, asaas, depois)).toEqual({ sent: true, valueCents: 27_500 });
    expect(enviados.at(-1)?.description).toBe('ClinicaIQ — plano Profissional + CRM (2 usuários)');
    expect((await loadCrmAddon(tenant.id, depois)).status).toBe('paid');
  });

  it('a última pessoa com acesso não sai enquanto o CRM estiver ligado', async () => {
    expect(await setCrmSeat(tenant.id, dono.id, recepcao.id, false)).toEqual({ ok: true });
    expect((await setCrmSeat(tenant.id, dono.id, dono.id, false)).ok).toBe(false);
  });

  it('desligar tira o CRM da cobrança; religar não dá teste de novo', async () => {
    const depois = new Date(Date.now() + 15 * 86_400_000);
    await turnOffCrm(tenant.id, dono.id);
    expect(await syncBillingValue(tenant.id, asaas, depois)).toEqual({ sent: true, valueCents: 19_700 });
    expect(await turnOnCrm(tenant.id, dono.id, depois)).toEqual({ ok: true, mode: 'paid' });
    expect(await syncBillingValue(tenant.id, asaas, depois)).toEqual({ sent: true, valueCents: 23_600 });
  });

  it('cortesia: CRM incluído, nada vai ao Asaas', async () => {
    await prisma.subscription.update({ where: { id: sub.id }, data: { complimentary: true } });
    expect(await syncBillingValue(tenant.id, asaas)).toEqual({ sent: false, reason: 'complimentary' });
    expect((await loadCrmAddon(tenant.id)).status).toBe('complimentary');
  });
});
