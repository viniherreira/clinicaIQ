import { test, expect } from '@playwright/test';
import { createPatient, tomorrowISO, uniqueName } from '../support/helpers';
import { E2E_PROFESSIONAL } from '../support/seed';

/**
 * Regressão da agenda. Existe para o CRM (e o que vier depois) não quebrar o
 * agendamento sem ninguém perceber: se algo aqui falhar depois de uma mudança,
 * a mudança afetou a agenda.
 */
test('cadastra paciente, agenda, marca falta e cancela', async ({ page }) => {
  const patientName = uniqueName('Paciente Agenda E2E');
  await createPatient(page, patientName);

  const date = tomorrowISO();
  await page.goto(`/agenda?date=${date}`);
  await page.getByRole('button', { name: 'Novo agendamento (N)' }).click();

  const modal = page.getByRole('dialog', { name: 'Novo agendamento' });
  await expect(modal).toBeVisible();

  await modal.getByLabel(/^Data/).fill(date);
  await modal.getByLabel(/^Início/).fill('10:00');
  await modal.getByLabel(/^Fim/).fill('10:30');

  await modal.getByRole('combobox', { name: /Profissional/ }).click();
  await page.getByRole('option', { name: E2E_PROFESSIONAL }).click();

  await modal.getByRole('combobox', { name: /Buscar paciente/ }).fill(patientName);
  await page.getByRole('option', { name: new RegExp(patientName) }).click();
  await expect(modal.getByText(`Selecionado: ${patientName}`, { exact: false })).toBeVisible();

  // Sem gateway de WhatsApp no ambiente de teste.
  await modal.getByRole('checkbox', { name: 'Enviar confirmação por WhatsApp' }).uncheck();
  await modal.getByRole('button', { name: 'Agendar' }).click();
  await expect(modal).toBeHidden();

  const block = page.getByRole('button', { name: new RegExp(`${patientName}.*Agendado`) });
  await expect(block).toBeVisible();

  // Falta
  await block.click();
  await page.getByRole('button', { name: 'Faltou', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Faltou', exact: true })).toBeDisabled();

  // Cancelamento
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
});
