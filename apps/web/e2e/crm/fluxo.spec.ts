import { test, expect } from '@playwright/test';
import { tomorrowISO } from '../support/helpers';
import { E2E_PROFESSIONAL } from '../support/seed';
import { createLeadViaModal, expectColumn } from './helpers';

/**
 * O caminho de um interessado até fechar, com o card andando sozinho conforme
 * a recepção usa a agenda e os orçamentos — o coração do CRM.
 */
test('lead → paciente → agendou → cancelou → reagendou → orçamento → fechou', async ({ page }) => {
  // Passa por mais de quinze telas; no servidor de desenvolvimento, dividido
  // com outros testes, o limite padrão não basta.
  test.setTimeout(240_000);
  const lead = await createLeadViaModal(page);

  // Sem próxima ação, o card avisa.
  await expect(page.getByRole('link', { name: lead.title, exact: true }).locator('..').locator('..')).toContainText('Sem tarefa');

  // Ficha do lead → Agendar avaliação → cadastro preenchido → agenda já com o paciente.
  await page.getByRole('link', { name: lead.title, exact: true }).click();
  await page.waitForURL(/\/crm\/leads\/[^/]+$/);
  const leadUrl = page.url();
  await page.getByRole('button', { name: 'Agendar avaliação' }).click();
  await page.waitForURL(/converter\?depois=agendar/);
  await expect(page.getByLabel('Nome completo')).toHaveValue(lead.name);
  await page.getByRole('checkbox', { name: /autoriza o armazenamento/ }).check();
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click();
  await page.waitForURL(/\/agenda/);

  const date = tomorrowISO();
  const marcar = async (hora: string) => {
    const modal = page.getByRole('dialog', { name: 'Novo agendamento' });
    await expect(modal.getByText(`Selecionado: ${lead.name}`, { exact: false })).toBeVisible();
    await modal.getByLabel(/^Data/).fill(date);
    await modal.getByLabel(/^Início/).fill(hora);
    await modal.getByLabel(/^Fim/).fill(hora.replace(':00', ':30'));
    await modal.getByRole('combobox', { name: /Profissional/ }).click();
    await page.getByRole('option', { name: E2E_PROFESSIONAL }).click();
    await modal.getByRole('checkbox', { name: 'Enviar confirmação por WhatsApp' }).uncheck();
    await modal.getByRole('button', { name: 'Agendar' }).click();
    await expect(modal).toBeHidden();
  };
  await marcar('16:00');
  await expectColumn(page, lead.title, 'Avaliação agendada');

  // Cancelou na agenda → volta para "Em conversa" com "Reagendar avaliação".
  await page.goto(`/agenda?date=${date}`);
  await page.getByRole('button', { name: new RegExp(`${lead.name}.*Agendado`) }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expectColumn(page, lead.title, 'Em conversa');
  await page.goto(leadUrl);
  await expect(page.getByRole('button', { name: 'Concluir tarefa: Reagendar avaliação' })).toBeVisible();

  // Reagendou → volta para "Avaliação agendada" e a tarefa se conclui sozinha.
  await page.getByRole('link', { name: 'Agendar avaliação' }).click();
  await page.waitForURL(/\/agenda/);
  await marcar('17:00');
  await expectColumn(page, lead.title, 'Avaliação agendada');
  await page.goto(leadUrl);
  await expect(page.getByRole('button', { name: 'Concluir tarefa: Reagendar avaliação' })).toHaveCount(0);

  // Orçamento criado → "Em negociação"; aprovado → "Fechou".
  await page.getByRole('link', { name: 'Novo orçamento' }).click();
  await page.waitForURL(/orcamentos\/novo/);
  await page.getByRole('combobox', { name: 'Adicionar procedimento' }).click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Criar orçamento' }).click();
  await page.waitForURL(/\/orcamentos\/(?!novo)[^/]+$/);
  const orcamentoUrl = page.url();
  await expectColumn(page, lead.title, 'Em negociação');

  await page.goto(orcamentoUrl);
  await page.getByRole('button', { name: 'Aprovar orçamento' }).click();
  await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
  await expectColumn(page, lead.title, 'fora do quadro');
  await page.goto(leadUrl);
  await expect(page.getByText('Negócio fechado', { exact: true })).toBeVisible();
  await expect(page.getByText('Negócio fechado — orçamento aprovado')).toBeVisible();
});
