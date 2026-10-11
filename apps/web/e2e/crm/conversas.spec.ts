import { test, expect } from '@playwright/test';
import { uniqueName } from '../support/helpers';
import { incomingMessage } from './chat';
import { columnOf, createLeadViaModal, uniquePhone, waitAnnounced } from './helpers';

/**
 * As conversas do WhatsApp no CRM. O gateway não roda nos testes: a mensagem
 * que chega é gravada direto no banco, como ele gravaria, e a resposta é dada
 * como enviada (sem gateway, o app simula).
 */

test('número novo cai na Entrada do funil; aceitar vira lead em Novo', async ({ page }) => {
  const nome = uniqueName('Contato E2E');
  await incomingMessage(uniquePhone(), nome, 'Oi! Quanto custa o clareamento?');

  await page.goto('/crm');
  await page.waitForLoadState('networkidle');
  const entrada = page.getByRole('region', { name: /Entrada/ });
  await expect(entrada.getByRole('link', { name: nome })).toBeVisible();
  await expect(entrada).toContainText('Oi! Quanto custa o clareamento?');

  await entrada.getByRole('button', { name: `Aceitar ${nome}` }).click();
  await waitAnnounced(page, `${nome} aceito em Novo.`);
  await expect.poll(() => columnOf(page, nome), { timeout: 20_000 }).toBe('Novo');
});

test('responder pela tela Conversas e ver na ficha do lead', async ({ page }) => {
  // Passa por cinco telas; no servidor de desenvolvimento, dividido com outros testes, demora.
  test.setTimeout(240_000);
  const lead = await createLeadViaModal(page);
  await incomingMessage(lead.phone, 'Apelido no Zap', 'Tem horário amanhã?');

  await page.goto('/crm/conversas');
  await page.waitForLoadState('networkidle');
  // A conversa já aparece com o nome do lead, não o do WhatsApp.
  await page.getByRole('button', { name: new RegExp(lead.name) }).click();
  const conversa = page.getByRole('region', { name: `Conversa com ${lead.name}` });
  await expect(conversa.getByText('Tem horário amanhã?')).toBeVisible();
  await expect(conversa.getByRole('link', { name: new RegExp(lead.title) })).toBeVisible();

  const resposta = `Tenho às 15h ${Date.now()}`;
  await conversa.getByRole('combobox', { name: 'Mensagem' }).fill(resposta);
  await page.keyboard.press('Enter');
  const bolha = conversa.getByRole('listitem').filter({ hasText: resposta });
  await expect(bolha).toBeVisible();
  // Sem gateway, a mensagem é dada como enviada logo depois.
  await expect(bolha.getByText('Enviada')).toBeAttached({ timeout: 20_000 });

  await conversa.getByRole('link', { name: new RegExp(lead.title) }).click();
  await page.waitForURL(/\/crm\/leads\/[^/]+$/);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: /Conversa/ }).click();
  await expect(page.getByText('Tem horário amanhã?')).toBeVisible();
  await expect(page.getByText(resposta)).toBeVisible();
});
