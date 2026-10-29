import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** O usuário que o Clerk devolve para quem está logado. Trocado em cada teste. */
let logado: {
  id: string;
  primaryEmailAddressId: string;
  emailAddresses: { id: string; emailAddress: string; verification: { status: string } }[];
} | null = null;

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: logado?.id ?? null }),
  clerkClient: async () => ({
    users: {
      getUser: async (id: string) => {
        if (logado && id === logado.id) return { ...logado, firstName: 'Teste', lastName: null, publicMetadata: {} };
        throw Object.assign(new Error('not found'), { status: 404 });
      },
      updateUserMetadata: async () => undefined,
    },
  }),
}));

/**
 * Entrar numa clínica por convite (achado F-06 da auditoria).
 *
 * O convite é achado pelo e-mail da conta do Clerk. O religamento por e-mail já
 * exigia e-mail verificado; o convite não — quem criasse conta com o e-mail
 * convidado sem confirmá-lo entrava na clínica com o perfil do convite. E o
 * convite pendente valia para sempre.
 */
const envFile = resolve(__dirname, '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('convite no onboarding (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { joinFromInviteIfAny } = await import('./actions');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `convite_${suffix}`, name: 'Convite teste', slug: `convite-${suffix}` },
  });
  const convidar = (email: string, criadoHaDias = 0) =>
    prisma.invitation.create({
      data: { tenantId: tenant.id, email, role: 'ADMIN', createdAt: new Date(Date.now() - criadoHaDias * 86_400_000) },
    });
  const entrar = (email: string, status: 'verified' | 'unverified') => {
    logado = {
      id: `user_convite_${email.split('@')[0]}`,
      primaryEmailAddressId: 'idn_1',
      emailAddresses: [{ id: 'idn_1', emailAddress: email, verification: { status } }],
    };
    return joinFromInviteIfAny();
  };
  const dentro = (email: string) => prisma.user.count({ where: { tenantId: tenant.id, email } });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.invitation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('não entra com o e-mail convidado ainda não verificado', async () => {
    const email = `nao-verificado-${suffix}@teste.local`;
    await convidar(email);
    expect(await entrar(email, 'unverified')).toBeNull();
    expect(await dentro(email)).toBe(0);
  });

  it('não entra por convite vencido', async () => {
    const email = `vencido-${suffix}@teste.local`;
    await convidar(email, 30);
    expect(await entrar(email, 'verified')).toBeNull();
    expect(await dentro(email)).toBe(0);
  });

  it('entra com e-mail verificado e convite em dia', async () => {
    const email = `em-dia-${suffix}@teste.local`;
    await convidar(email, 2);
    expect(await entrar(email, 'verified')).toBe(tenant.id);
    expect(await dentro(email)).toBe(1);
  });
});
