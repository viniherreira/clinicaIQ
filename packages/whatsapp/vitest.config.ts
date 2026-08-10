import { defineConfig } from 'vitest/config';

/** Escopado ao src deste pacote — sem `root`, o vitest sobe até a raiz do
 *  monorepo e tenta coletar os specs Playwright do app web. */
export default defineConfig({
  test: { root: __dirname, environment: 'node', include: ['src/**/*.test.ts'] },
});
