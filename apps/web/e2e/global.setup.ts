import { test as setup, expect } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { required } from './support/env';
import { seedE2EClinic } from './support/seed';

export const OWNER_STATE = 'e2e/.auth/owner.json';

setup.describe.configure({ mode: 'serial' });

setup('prepara a clínica de teste', async () => {
  await seedE2EClinic();
});

setup('entra com a conta de teste', async ({ page }) => {
  // Pega um testing token do Clerk: sem ele, o Clerk trata o navegador
  // automatizado como robô e barra o login.
  await clerkSetup();

  await page.goto('/');
  // Entra pelo e-mail, sem senha: o @clerk/testing pede ao Clerk um token de
  // login para essa conta usando a CLERK_SECRET_KEY.
  await clerk.signIn({ page, emailAddress: required('E2E_CLERK_USER_EMAIL') });

  await page.goto('/dashboard');
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();

  await page.context().storageState({ path: OWNER_STATE });
});
