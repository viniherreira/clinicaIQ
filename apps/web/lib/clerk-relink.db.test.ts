import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('religar login pelo e-mail confirmado (troca de instância do Clerk)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { relinkByVerifiedEmail } = await import('./clerk-relink');

  const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `rl_${s}`, name: 'Religar', slug: `religar-${s}` } });
  const dona = await prisma.user.create({
    data: { tenantId: tenant.id, name: 'Dona', email: `Dona-${s}@teste.local`, role: 'OWNER', clerkUserId: `user_dev_${s}` },
  });
  const saiu = await prisma.user.create({
    data: { tenantId: tenant.id, name: 'Saiu', email: `saiu-${s}@teste.local`, role: 'RECEPTIONIST', active: false, previousClerkUserId: `user_old_${s}` },
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  /** O usuário antigo não existe mais neste Clerk (troca de instância). */
  const sumiu = async () => false;

  it('mesmo e-mail (sem diferença de maiúscula) com usuário novo volta para a clínica dela', async () => {
    expect(await relinkByVerifiedEmail(`user_prod_${s}`, [`dona-${s}@teste.local`], sumiu)).toBe(tenant.id);
    const linha = await prisma.user.findUniqueOrThrow({ where: { id: dona.id } });
    expect(linha.clerkUserId).toBe(`user_prod_${s}`);
    expect(linha.previousClerkUserId).toBe(`user_dev_${s}`);
    expect(await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'LOGIN_RELINKED' } })).toBe(1);
  });

  it('quem foi removido da equipe não volta pelo e-mail; e-mail desconhecido não faz nada', async () => {
    expect(await relinkByVerifiedEmail(`user_x_${s}`, [`saiu-${s}@teste.local`], sumiu)).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: saiu.id } })).clerkUserId).toBeNull();
    expect(await relinkByVerifiedEmail(`user_y_${s}`, [`ninguem-${s}@teste.local`], sumiu)).toBeNull();
    expect(await relinkByVerifiedEmail(`user_z_${s}`, [], sumiu)).toBeNull();
  });

  it('não toma o lugar de uma conta que continua existindo no Clerk', async () => {
    const ativa = await prisma.user.create({
      data: { tenantId: tenant.id, name: 'Ativa', email: `ativa-${s}@teste.local`, role: 'RECEPTIONIST', clerkUserId: `user_vivo_${s}` },
    });
    const consultados: string[] = [];
    const existe = async (id: string) => {
      consultados.push(id);
      return true;
    };
    expect(await relinkByVerifiedEmail(`user_novo_${s}`, [`ativa-${s}@teste.local`], existe)).toBeNull();
    expect(consultados).toEqual([`user_vivo_${s}`]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ativa.id } })).clerkUserId).toBe(`user_vivo_${s}`);
  });
});
