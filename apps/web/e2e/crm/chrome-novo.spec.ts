import { test, expect } from '@playwright/test';

/**
 * No Chrome novo, `scrollIntoView()` devolve uma Promise. Um efeito que a
 * devolvia (`useEffect(() => el.scrollIntoView())`) virava a "limpeza" do
 * React, e a tela caía em "Algo deu errado" ao criar um robô. Aqui o
 * navegador do teste imita esse Chrome. A regra de lint `no-restricted-syntax`
 * do `eslint.config.mjs` impede o padrão de voltar.
 */
test('robô, conversas e ficha com scrollIntoView que devolve Promise', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, ...a: unknown[]) {
      orig.apply(this, a as []);
      return Promise.resolve() as unknown as void;
    };
  });

  for (const modelo of [/Boas-vindas/, /Fora do horário/, /Em branco/]) {
    await page.goto('/crm/automacoes/bots');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Novo robô' }).click();
    await page.getByRole('link', { name: modelo }).click();
    await page.waitForURL(/\/crm\/automacoes\/bots\/novo/);
    await page.getByRole('button', { name: 'Testar' }).click();
    const log = page.getByRole('log', { name: 'Conversa de teste' });
    await expect(log).toBeVisible();
    if (await log.getByRole('button').count()) await log.getByRole('button').first().click();
    await page.getByRole('button', { name: 'Recomeçar' }).click();
    await page.getByRole('link', { name: 'Robôs' }).click();
    await expect(page.getByRole('button', { name: 'Novo robô' })).toBeVisible();
  }

  await page.goto('/crm/conversas');
  await page.waitForLoadState('networkidle');
  await page.goto('/crm/leads');
  await page.waitForLoadState('networkidle');
  const ficha = page.locator('a[href^="/crm/leads/"]').first();
  if (await ficha.count()) {
    await ficha.click();
    await page.waitForLoadState('networkidle');
    await page.goto('/crm');
    await page.waitForLoadState('networkidle');
  }
  await expect(page.getByText('Algo deu errado')).toHaveCount(0);
});
