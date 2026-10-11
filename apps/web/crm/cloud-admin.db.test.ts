import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe('modelos: regras antes de mandar para a Meta', async () => {
  const { templateProblem, fromGraph } = await import('./cloud-admin');

  it.each([
    [{ name: 'Retomar Contato', body: 'Oi', examples: [] }, /minúsculas/],
    [{ name: 'ok', body: '   ', examples: [] }, /Escreva/],
    [{ name: 'ok', body: 'Oi {{2}}, tudo bem?', examples: ['a', 'b'] }, /sem pular/],
    [{ name: 'ok', body: '{{1}}, tudo bem?', examples: ['Ana'] }, /começo nem no fim/],
    [{ name: 'ok', body: 'Oi {{1}}, tudo bem?', examples: [''] }, /exemplo/],
  ])('%#', (input, erro) => {
    expect(templateProblem(input)).toMatch(erro);
  });

  it('modelo válido passa', () => {
    expect(templateProblem({ name: 'retomar_contato', body: 'Oi {{1}}, ficou alguma dúvida?', examples: ['Ana'] })).toBeNull();
  });

  it('modelo vindo da Meta', () => {
    expect(
      fromGraph({ id: '9', name: 'promo', language: 'pt_BR', category: 'MARKETING', status: 'REJECTED', rejected_reason: 'PROMOTIONAL', components: [{ type: 'BODY', text: 'Oi {{1}} e {{2}}' }] }),
    ).toMatchObject({ status: 'REJECTED', variables: 2, rejectedReason: 'PROMOTIONAL', body: 'Oi {{1}} e {{2}}' });
  });
});

describe.skipIf(!process.env.DATABASE_URL)('conectar a API oficial (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { connectManual, disconnectCloud, syncTemplates } = await import('./cloud-admin');
  const { activeCloudAccount } = await import('./cloud');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `cadm_${suffix}`, name: 'Conectar', slug: `cadm-${suffix}` } });
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `d-${suffix}@teste.local`, role: 'OWNER' } });
  const pn = String(Date.now()).slice(-12);
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.messageTemplate.deleteMany({ where: t });
    await prisma.auditLog.deleteMany({ where: t });
    await prisma.whatsAppCloudAccount.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('conexão de teste confere o número na Meta, guarda o token cifrado e registra na auditoria', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ display_phone_number: '+1 555 0100', verified_name: 'Teste', success: true }))));
    expect(await connectManual(tenant.id, user.id, { token: 'TOKEN-TESTE', phoneNumberId: pn, wabaId: '123456789' })).toEqual({ ok: true });
    const row = await prisma.whatsAppCloudAccount.findUnique({ where: { tenantId: tenant.id } });
    expect(row).toMatchObject({ manual: true, active: true, displayPhone: '+1 555 0100' });
    expect(row?.accessTokenEncrypted).not.toContain('TOKEN-TESTE');
    expect((await activeCloudAccount(tenant.id))?.token).toBe('TOKEN-TESTE');
    expect(await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'WHATSAPP_CLOUD_CONNECTED' } })).toBe(1);
  });

  it('token errado: não conecta e diz por quê', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, message: 'bad' } }), { status: 401 })));
    const r = await connectManual(tenant.id, user.id, { token: 'ERRADO', phoneNumberId: pn, wabaId: '123456789' });
    expect(r).toMatchObject({ ok: false });
  });

  it('sincroniza os modelos da Meta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: '1', name: 'retomar', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'BODY', text: 'Oi {{1}}' }] }] })),
      ),
    );
    expect(await syncTemplates(tenant.id)).toEqual({ ok: true, count: 1 });
    expect(await prisma.messageTemplate.findFirst({ where: { tenantId: tenant.id } })).toMatchObject({ name: 'retomar', status: 'APPROVED', variables: 1 });
  });

  it('desconectar volta para o QR', async () => {
    expect(await disconnectCloud(tenant.id, user.id)).toEqual({ ok: true });
    expect(await activeCloudAccount(tenant.id)).toBeNull();
  });
});
