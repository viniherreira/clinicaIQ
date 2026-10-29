import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * O limite de tentativas vale entre instâncias (achado F-05 da auditoria).
 *
 * Na Vercel cada função roda em várias instâncias, que nascem e morrem. Um
 * contador na memória do processo vira "5 por minuto por instância" — na
 * prática, sem limite. Aqui cada `import` novo do módulo faz o papel de uma
 * instância nova: o contador tem de continuar de onde a outra parou.
 */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('rateLimit (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const chave = `teste-rl:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const novaInstancia = async () => {
    vi.resetModules();
    return (await import('./rate-limit')).rateLimit;
  };

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "rate_limits" WHERE "key" LIKE ${`${chave}%`}`.catch(() => undefined);
  });

  it('conta as tentativas de todas as instâncias juntas', async () => {
    for (let i = 0; i < 5; i++) {
      const rateLimit = await novaInstancia();
      expect((await rateLimit(chave, 5, 60_000)).ok).toBe(true);
    }
    const rateLimit = await novaInstancia();
    const sexta = await rateLimit(chave, 5, 60_000);
    expect(sexta.ok).toBe(false);
    expect(sexta.retryAfter).toBeGreaterThan(0);
  });

  it('libera de novo quando a janela acaba', async () => {
    const rateLimit = await novaInstancia();
    const k = `${chave}:janela`;
    expect((await rateLimit(k, 1, 50)).ok).toBe(true);
    expect((await rateLimit(k, 1, 50)).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect((await rateLimit(k, 1, 50)).ok).toBe(true);
  });
});
