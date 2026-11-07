import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prisma } from '@clinicaiq/db';
import { E2E_TENANT_SLUG } from '../support/seed';

test.beforeAll(async () => {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG }, select: { id: true } });
  await prisma.subscription.update({ where: { tenantId: t.id }, data: { assistantEnabled: true } });
});
test.afterAll(async () => {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG }, select: { id: true } });
  await prisma.subscription.update({ where: { tenantId: t.id }, data: { assistantEnabled: false } });
});

test('o painel do assistente pergunta e mostra a resposta, sem violar WCAG', async ({ page }) => {
  await page.route('**/api/assistente', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: `Temos 12 agendamentos amanhã.\n\u0000{"conversaId":"c1","parouPor":"end_turn"}` }),
  );
  await page.route('**/api/assistente/conversas', (route) => route.fulfill({ json: { conversas: [] } }));

  await page.goto('/agenda');
  await page.getByRole('button', { name: 'Assistente' }).click();
  const painel = page.getByRole('dialog', { name: 'Assistente' });
  await expect(painel).toBeVisible();

  await painel.getByLabel('Sua pergunta').fill('Quantos agendamentos temos amanhã?');
  await painel.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(painel.getByText('Temos 12 agendamentos amanhã.')).toBeVisible();

  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
});
