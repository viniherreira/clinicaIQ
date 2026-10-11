import { test, expect } from '@playwright/test';

/**
 * O CRM como adicional pago, pela tela. A clínica de teste está em cortesia:
 * o CRM vem incluído e aberto a toda a equipe com perfil de CRM. Ligar,
 * desligar e a chave por pessoa (clínica pagante) ficam nos testes contra o
 * banco (crm/addon.db.test.ts e crm/guard.test.ts) — mexer nisso aqui
 * atrapalharia os outros testes do CRM que rodam em paralelo.
 */
test.describe.configure({ mode: 'serial' });

test('Plano mostra o CRM incluído na cortesia', async ({ page }) => {
  await page.goto('/configuracoes#plano');
  await page.waitForLoadState('networkidle');
  const cartao = page.getByRole('region', { name: 'CRM · adicional' });
  await expect(cartao).toContainText('Incluído na cortesia');
  await expect(cartao.getByRole('link', { name: 'Abrir o CRM' })).toBeVisible();
  // Na cortesia não há o que desligar nem cobrança por pessoa.
  await expect(cartao.getByRole('button', { name: 'Desligar o CRM' })).toHaveCount(0);
});

test('Equipe: na cortesia, toda a equipe com perfil de CRM tem acesso', async ({ page }) => {
  await page.goto('/configuracoes#equipe');
  await page.waitForLoadState('networkidle');
  const secao = page.getByRole('region', { name: 'Acesso ao CRM' });
  await expect(secao).toContainText('toda a equipe com perfil de dono, administração ou recepção');
  await expect(secao.getByRole('switch')).toHaveCount(0);
});
