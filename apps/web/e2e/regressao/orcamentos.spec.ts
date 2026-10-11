import { test, expect } from '@playwright/test';
import { createPatient, uniqueName } from '../support/helpers';
import { E2E_PROCEDURE, E2E_PUBLIC_QUOTE_TOKEN } from '../support/seed';

/**
 * Regressão dos orçamentos: criar e aprovar pela clínica, e aceitar pelo link
 * público. O CRM vai escutar esses momentos — se ele atrapalhar algum, aparece aqui.
 */
test('cria orçamento e aprova pela clínica', async ({ page }) => {
  const patientName = uniqueName('Paciente Orçamento E2E');
  const patientId = await createPatient(page, patientName);

  await page.goto(`/orcamentos/novo?patientId=${patientId}`);
  await expect(page.getByText(`Selecionado: ${patientName}`, { exact: false })).toBeVisible();

  await page.getByRole('combobox', { name: 'Adicionar procedimento' }).click();
  await page.getByRole('option', { name: new RegExp(E2E_PROCEDURE) }).click();
  await expect(page.getByRole('textbox', { name: 'Nome do item' })).toHaveValue(E2E_PROCEDURE);

  await page.getByRole('button', { name: 'Criar orçamento' }).click();
  await page.waitForURL(/\/orcamentos\/(?!novo)[^/]+$/);

  await page.getByRole('button', { name: 'Aprovar orçamento' }).click();
  await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
});

test('paciente aceita orçamento pelo link público', async ({ browser }) => {
  // Sem login: é o paciente abrindo o link.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto(`/orcamento/${E2E_PUBLIC_QUOTE_TOKEN}`);
  await page.getByRole('button', { name: 'Aceitar orçamento' }).click();
  await expect(page.getByText('Orçamento aceito!')).toBeVisible();

  await context.close();
});
