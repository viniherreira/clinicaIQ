import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Os `*.db.test.ts` gravam no banco já no corpo do `describe`, e o Vitest roda
 * esse corpo mesmo quando o `describe` está pulado. Sem banco (CI, máquina sem
 * os arquivos de ambiente que eles leem), ficam de fora aqui.
 */
const hasDb =
  Boolean(process.env.DATABASE_URL) ||
  ['../../packages/db/.env', '../web/.env.local'].some((f) => existsSync(resolve(__dirname, f)));

/**
 * Escopado ao `src` deste pacote de propósito. Sem `root`, o vitest sobe até a
 * raiz do monorepo e tenta coletar os specs Playwright do app web, que falham na
 * coleta porque `test.describe` do Playwright não roda dentro do vitest.
 */
export default defineConfig({
  test: {
    root: __dirname,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', ...(hasDb ? [] : ['src/**/*.db.test.ts'])],
  },
});
