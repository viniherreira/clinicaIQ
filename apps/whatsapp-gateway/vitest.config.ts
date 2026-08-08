import { defineConfig } from 'vitest/config';

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
  },
});
