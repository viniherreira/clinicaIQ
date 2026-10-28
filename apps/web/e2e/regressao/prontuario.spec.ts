import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prisma } from '@clinicaiq/db';
import { createPatient, uniqueName } from '../support/helpers';

/**
 * A ficha do paciente: odontograma por faces (marcar, realizar, plano de
 * tratamento), a evolução escrita sozinha, a anamnese com alerta e as abas
 * guardadas no endereço.
 */
test('odontograma: cárie por face vira plano; realizar escreve a evolução', async ({ page }) => {
  const name = uniqueName('Paciente Odonto');
  const id = await createPatient(page, name);

  await page.getByRole('tab', { name: /Odontograma/ }).click();
  await expect(page).toHaveURL(/aba=odontograma/);

  // Escolhe o 36, marca as faces O e M e a cárie.
  await page.getByRole('button', { name: /^Dente 36,/ }).click();
  const painel = page.getByRole('complementary', { name: 'Marcar no odontograma' });
  await expect(painel.getByRole('heading', { name: 'Dente 36' })).toBeVisible();
  await painel.getByRole('button', { name: /Oclusal/ }).click();
  await painel.getByRole('button', { name: /Mesial/ }).click();
  await painel.getByRole('button', { name: /^Cárie/ }).click();
  await expect(painel.getByRole('status')).toContainText('Cárie MO no 36');

  const plano = page.getByRole('region', { name: /Plano de tratamento/ });
  await expect(plano.getByRole('row', { name: /Cárie/ })).toContainText('MO');
  await expect(page.getByRole('tab', { name: /Odontograma/ })).toContainText('1');

  // Realizar: sai do plano, vai para o histórico e vira evolução.
  await plano.getByRole('button', { name: 'Marcar Cárie no dente 36 como realizado' }).click();
  await expect(plano.getByText('Nada a fazer.')).toBeVisible();
  await expect(page.getByRole('region', { name: /Realizados e pré-existentes/ })).toContainText('dente 36');
  const evo = await prisma.evolution.findFirst({ where: { patientId: id }, orderBy: { createdAt: 'desc' } });
  expect(evo?.description).toBe('Realizado: Cárie MO no dente 36.');
  expect(evo?.teeth).toEqual([36]);

  // Vários dentes de uma vez, marca do dente todo.
  await page.getByRole('button', { name: /^Dente 11,/ }).click();
  await page.getByRole('button', { name: /^Dente 21,/ }).click({ modifiers: ['Control'] });
  await expect(painel.getByRole('heading', { name: '2 dentes' })).toBeVisible();
  await painel.getByRole('button', { name: /^Faceta/ }).click();
  await expect(plano.getByRole('row', { name: /Faceta/ })).toHaveCount(2);

  // A aba fica no endereço: recarregar volta nela.
  await page.reload();
  await expect(page.getByRole('tab', { name: /Odontograma/ })).toHaveAttribute('aria-selected', 'true');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

test('anamnese: alergia aparece no topo da ficha', async ({ page }) => {
  const name = uniqueName('Paciente Anamnese');
  await createPatient(page, name);
  await expect(page.getByText('Anamnese não preenchida')).toBeVisible();

  await page.getByRole('tab', { name: /Anamnese/ }).click();
  await page.getByRole('radiogroup', { name: /alergia/ }).getByRole('radio', { name: 'Sim' }).click();
  await page.getByLabel(/alergia.*detalhe/).fill('Dipirona');
  await page.getByRole('button', { name: /Marcar o resto como/ }).click();
  await page.getByRole('button', { name: 'Salvar anamnese' }).click();
  await expect(page.getByText('Anamnese salva')).toBeVisible();

  await page.reload();
  await expect(page.locator('header').filter({ hasText: name }).getByText(/Alergia/)).toContainText('Dipirona');
  await expect(page.getByText('Anamnese não preenchida')).toHaveCount(0);
});
