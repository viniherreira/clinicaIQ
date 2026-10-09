import { test, expect } from '@playwright/test';
import { E2E_RECEPTIONIST } from '../support/seed';

/**
 * O CRM como adicional pago, pela tela. A clínica de teste está em cortesia
 * (CRM incluído); ligar e desligar o módulo mexeria nos outros testes do CRM
 * que rodam em paralelo, então isso fica nos testes contra o banco
 * (crm/addon.db.test.ts). Aqui: o cartão no Plano e a chave por pessoa.
 */
test.describe.configure({ mode: 'serial' });

test('Plano mostra o CRM incluído na cortesia', async ({ page }) => {
  await page.goto('/configuracoes#plano');
  await page.waitForLoadState('networkidle');
  const cartao = page.getByRole('region', { name: 'CRM · adicional' });
  await expect(cartao).toContainText('Incluído na cortesia');
  await expect(cartao.getByRole('button', { name: 'Desligar o CRM' })).toBeVisible();
});

test('Equipe: dar e tirar acesso ao CRM, e a última pessoa não sai', async ({ page }) => {
  await page.goto('/configuracoes#equipe');
  await page.waitForLoadState('networkidle');
  const secao = page.getByRole('region', { name: 'Acesso ao CRM' });
  const recepcao = secao.getByRole('switch', { name: `Acesso ao CRM para ${E2E_RECEPTIONIST}` });
  await expect(recepcao).not.toBeChecked();

  await recepcao.check();
  await expect(recepcao).toBeChecked();
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(secao.getByRole('switch', { name: `Acesso ao CRM para ${E2E_RECEPTIONIST}` })).toBeChecked();

  await secao.getByRole('switch', { name: `Acesso ao CRM para ${E2E_RECEPTIONIST}` }).uncheck();
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(secao.getByRole('switch', { name: `Acesso ao CRM para ${E2E_RECEPTIONIST}` })).not.toBeChecked();

  // Sozinho com acesso, o dono não consegue se tirar: alguém precisa abrir o CRM.
  const dono = secao.getByRole('switch', { name: /Acesso ao CRM para Dono E2E/ });
  await dono.uncheck();
  await expect(secao.getByRole('alert')).toContainText('Pelo menos uma pessoa');
  await expect(dono).toBeChecked();
});
