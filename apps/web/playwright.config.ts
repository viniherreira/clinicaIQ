import { defineConfig, devices } from '@playwright/test';
import { loadTestEnv } from './e2e/support/env';

loadTestEnv();

const OWNER_STATE = 'e2e/.auth/owner.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  // Em `next dev`, a primeira chamada de cada tela ou server action compila na
  // hora e pode levar vários segundos. Com os 5s/30s padrão, a primeira
  // execução numa máquina fria falhava sem nada estar quebrado.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // Páginas públicas: não precisam de banco semeado nem de conta no Clerk.
    {
      name: 'publico',
      testMatch: /a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Semeia a clínica de teste e faz login uma vez; os projetos logados
    // reaproveitam a sessão salva.
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'logado',
      testMatch: /regressao\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: OWNER_STATE },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // O primeiro build do Turbopack numa máquina fria passa fácil do minuto.
    timeout: 180_000,
  },
});
