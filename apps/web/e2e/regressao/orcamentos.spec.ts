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

test('orçamento completo: busca, dentes, parcelas, aprovar, receber a parcela e baixar o recibo', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const patientName = uniqueName('Paciente Parcelas E2E');
  const patientId = await createPatient(page, patientName);

  await page.goto(`/orcamentos/novo?patientId=${patientId}`);
  await page.waitForLoadState('networkidle');
  // Busca pelo nome e Enter adiciona.
  const busca = page.getByRole('combobox', { name: 'Adicionar procedimento' });
  await busca.fill(E2E_PROCEDURE.slice(0, 8));
  await busca.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Nome do item' })).toHaveValue(E2E_PROCEDURE);

  // Dois dentes: o texto e a quantidade saem do odontograma.
  await page.getByRole('button', { name: /^Dentes de/ }).click();
  await page.getByRole('button', { name: /^11 — / }).click();
  await page.getByRole('button', { name: /^21 — / }).click();
  expect((await axe()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.getByRole('textbox', { name: /^Dente ou região/ })).toHaveValue('Dentes 11 e 21');
  await expect(page.getByRole('spinbutton', { name: 'Quantidade' })).toHaveValue('2');

  await page.getByLabel('Parcelas').fill('3');
  await expect(page.getByRole('list', { name: 'Parcelas, contando da aprovação' }).getByRole('listitem')).toHaveCount(3);
  expect((await axe()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Criar orçamento' }).click();
  await page.waitForURL(/\/orcamentos\/(?!novo)[^/]+$/);
  await page.getByRole('button', { name: 'Aprovar orçamento' }).click();
  await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();

  // O plano mostra as três parcelas; "Receber" na primeira já vem com o valor dela.
  const plano = page.getByRole('table', { name: /Parcelas do orçamento/ });
  await expect(plano.getByRole('row')).toHaveCount(4);
  await plano.getByRole('button', { name: /Receber Parcela 1 de 3/ }).click();
  const janela = page.getByRole('dialog', { name: 'Registrar pagamento' });
  await expect(janela.getByLabel('Valor recebido')).not.toHaveValue('');
  await janela.getByRole('button', { name: 'PIX', exact: true }).click();
  expect((await axe()).violations).toEqual([]);
  await janela.getByRole('button', { name: /^Registrar R\$/ }).click();
  await expect(page.getByRole('dialog', { name: 'Pagamento registrado' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Baixar recibo' })).toHaveAttribute('href', /\/financeiro\/recibo\//);
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  await expect(plano.getByRole('row', { name: /Parcela 1 de 3/ })).toContainText('Paga');
  await expect(page.getByRole('list').filter({ hasText: 'Parcela 1 de 3' }).first()).toContainText('PIX');
});
