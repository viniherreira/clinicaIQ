import { defineConfig } from 'vitest/config';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Os `*.db.test.ts` gravam no banco já no corpo do `describe`, e o Vitest roda
 * esse corpo mesmo quando o `describe` está pulado. Sem banco (CI, máquina sem
 * `.env.local`), ficam de fora aqui, em vez de quebrar a suíte.
 */
const hasDb = Boolean(process.env.DATABASE_URL) || existsSync(path.resolve(__dirname, '.env.local'));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['**/e2e/**', '**/node_modules/**', ...(hasDb ? [] : ['**/*.db.test.ts'])],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
