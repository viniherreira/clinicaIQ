import { test, expect } from '@playwright/test';
import { incomingMessage } from './chat';
import { createLeadViaModal } from './helpers';

/** LGPD: apagar os dados de uma pessoa a pedido dela, pela ficha do lead. */
test('apagar dados desta pessoa tira o lead do funil e a conversa da caixa', async ({ page }) => {
  test.setTimeout(180_000);
  const lead = await createLeadViaModal(page);
  await incomingMessage(lead.phone, 'Quem pediu', 'Quero que apaguem meus dados.');

  await page.getByRole('region', { name: 'Novo' }).getByRole('link', { name: lead.title, exact: true }).click();
  await page.waitForURL(/\/crm\/leads\/[^/]+$/);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Apagar dados desta pessoa' }).click();
  const d = page.getByRole('dialog', { name: `Apagar os dados de ${lead.name}?` });
  await expect(d).toBeVisible();
  const confirmar = d.getByRole('button', { name: 'Apagar dados' });
  await expect(confirmar).toBeDisabled();
  await d.getByLabel('Para confirmar, digite APAGAR').fill('apagar');
  await confirmar.click();

  await page.waitForURL(/\/crm$/);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: lead.title, exact: true })).toHaveCount(0);

  await page.goto(`/crm/conversas?q=${encodeURIComponent(lead.phone.slice(-4))}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: new RegExp(lead.name) })).toHaveCount(0);
});
