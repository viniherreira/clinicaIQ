import { test, expect } from '@playwright/test';
import { uniqueName } from '../support/helpers';
import { uniquePhone } from './helpers';

/**
 * Vários funis, como no Kommo: criar um funil, editar as etapas no próprio
 * quadro, pôr um lead nele, filtrar e, ao excluir o funil, os leads irem para
 * o funil principal.
 */
test('criar funil, editar etapas, filtrar e excluir levando os leads', async ({ page }) => {
  test.setTimeout(180_000);
  const funil = uniqueName('Funil E2E').slice(0, 30);
  const etapa = uniqueName('Retorno').slice(0, 20);
  const nome = uniqueName('Lead Funil');

  await page.goto('/crm');
  await page.waitForLoadState('networkidle');

  // Novo funil pelo nome do funil, no canto do quadro.
  await page.getByRole('button', { name: /Funil:/ }).click();
  await page.getByRole('menuitem', { name: 'Novo funil' }).click();
  await page.getByLabel('Nome do funil').fill(funil);
  await page.getByRole('button', { name: 'Criar funil' }).click();

  // Abre direto no "Editar funil": adiciona uma etapa.
  await expect(page.getByLabel('Editar funil')).toHaveValue(funil);
  await page.getByLabel('Adicionar etapa').fill(etapa);
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('region', { name: `Etapa ${etapa}` })).toBeVisible();
  await page.getByRole('link', { name: 'Concluir' }).click();

  // No quadro do funil novo: as colunas dele e a etapa criada no fim.
  await expect(page.getByRole('button', { name: new RegExp(`Funil: ${funil}`) })).toBeVisible();
  const colunas = page.getByRole('list', { name: 'Etapas do funil' }).getByRole('heading', { level: 2 });
  await expect(colunas).toHaveText([/^Novo/, /^Em conversa/, /^Em negociação/, new RegExp(`^${etapa}`)]);

  // Um lead pela adição rápida da primeira coluna.
  const novo = page.getByRole('region', { name: 'Novo' });
  await novo.getByRole('button', { name: /Adição rápida/ }).click();
  await novo.getByLabel('Nome').fill(nome);
  await novo.getByLabel('Telefone').fill(uniquePhone());
  await novo.getByRole('button', { name: 'Adicionar' }).click();
  await expect(novo.getByRole('link', { name: nome, exact: true })).toBeVisible();

  // Filtro "Meus leads" (quem cria é o responsável): o lead continua; o rótulo da busca muda.
  await page.getByRole('button', { name: /abrir filtros/ }).click();
  await page.getByRole('dialog', { name: 'Filtros' }).getByRole('button', { name: 'Meus leads' }).click();
  await expect(page).toHaveURL(/resp=me/);
  await expect(page.getByRole('button', { name: /Meus leads.*abrir filtros/ })).toBeVisible();
  await expect(page.getByRole('link', { name: nome, exact: true })).toBeVisible();

  // Excluir o funil: os leads vão para a entrada do funil principal.
  await page.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: 'Editar funil' }).click();
  await page.getByRole('button', { name: 'Excluir funil' }).click();
  await page.getByLabel('Funil de destino').selectOption({ label: 'Funil principal' });
  await page.getByRole('button', { name: 'Excluir e mover os leads' }).click();
  await expect(page.getByRole('button', { name: /Funil: Funil principal/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Novo' }).getByRole('link', { name: nome, exact: true })).toBeVisible();
});
