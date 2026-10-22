import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * A API oficial na gestão da clínica (sem passar pelo CRM): o cartão de conexão
 * na página WhatsApp e os textos das mensagens com as variáveis, não com um
 * paciente de exemplo. Nada aqui conecta de verdade: a clínica de teste é
 * compartilhada com os outros testes.
 */
const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test('página WhatsApp: cartão da API oficial com a conexão por token, sem violações', async ({ page }) => {
  await page.goto('/whatsapp');
  await page.waitForLoadState('networkidle');
  const cartao = page.getByRole('region', { name: /API oficial do WhatsApp/ });
  await expect(cartao).toBeVisible();
  await expect(cartao).toContainText('Confirmação e lembrete com os botões Confirmar e Reagendar');
  expect((await axe(page)).violations).toEqual([]);

  // Identificador que não é número: a conta nem chega a ser procurada na Meta.
  await cartao.getByText(/Conectar com token/).click();
  await cartao.getByLabel('Token de acesso').fill('token-de-mentira');
  await cartao.getByLabel('ID do número de telefone').fill('abc');
  await cartao.getByLabel('ID da conta do WhatsApp Business').fill('123');
  await cartao.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(cartao.getByRole('alert')).toContainText('só números');
  expect((await axe(page)).violations).toEqual([]);
});

test('mensagens automáticas começam com as variáveis, não com um paciente de exemplo', async ({ page }) => {
  await page.goto('/configuracoes#comunicacao');
  await page.waitForLoadState('networkidle');
  const lembrete = page.getByLabel('Texto da mensagem: Lembrete antes da consulta');
  if (!(await lembrete.isVisible())) test.skip(true, 'lembrete desligado nesta clínica de teste');
  await expect(lembrete).toHaveValue(/\{nome\}/);
  await expect(lembrete).toHaveValue(/\{data\} às \{hora\}/);
  await expect(lembrete).not.toHaveValue(/Maria/);
});

test('lembrete: escolher os dias e os botões, com a prévia de como chega', async ({ page }) => {
  await page.goto('/configuracoes#comunicacao');
  await page.waitForLoadState('networkidle');
  const lembrete = page.getByLabel('Texto da mensagem: Lembrete antes da consulta');
  if (!(await lembrete.isVisible())) test.skip(true, 'lembrete desligado nesta clínica de teste');

  // Nada é salvo aqui: a clínica de teste é compartilhada.
  const semana = page.getByRole('checkbox', { name: /1 semana antes/ });
  // O dia é um chip: a caixa fica escondida e quem clica é no chip (ou espaço com o foco nele).
  const marcado = await semana.isChecked();
  await page.locator('label', { hasText: '1 semana antes' }).click();
  await expect(semana).toBeChecked({ checked: !marcado });
  await semana.press('Space');
  await expect(semana).toBeChecked({ checked: marcado });
  if (!marcado) await page.locator('label', { hasText: '1 semana antes' }).click();
  await expect(semana).toBeChecked();

  const bloco = page.getByRole('group', { name: 'Botões da mensagem' }).last();
  await bloco.getByRole('checkbox', { name: 'Cancelar' }).check();
  await bloco.getByLabel('Nome do botão Cancelar').fill('Não vou poder');

  const previa = page.getByRole('figure').filter({ hasText: 'Como chega no WhatsApp' }).last();
  await expect(previa).toContainText('Olá, Ana!');
  await expect(previa.getByRole('list', { name: 'Botões da mensagem' })).toContainText('Não vou poder');
  expect((await axe(page)).violations).toEqual([]);
});
