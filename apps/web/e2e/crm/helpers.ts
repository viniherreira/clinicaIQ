import { expect, type Page } from '@playwright/test';
import { uniqueName } from '../support/helpers';

/** Telefone que nenhum outro teste usa: os testes rodam em paralelo no mesmo banco. */
export function uniquePhone(): string {
  const n = Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
  return `119${n}`;
}

/** Cria um lead pelo "Novo lead" do funil e devolve o título usado. */
export async function createLeadViaModal(page: Page, opts: { name?: string; title?: string; phone?: string } = {}) {
  const name = opts.name ?? uniqueName('Lead E2E');
  const title = opts.title ?? uniqueName('Negócio E2E');
  const phone = opts.phone ?? uniquePhone();
  await page.goto('/crm');
  await page.waitForLoadState('networkidle');
  const d = page.getByRole('dialog', { name: 'Novo lead' });
  // Com o servidor de desenvolvimento carregado, o clique pode chegar antes de
  // a página ganhar vida; como uma pessoa faria, clica de novo.
  await expect(async () => {
    await page.getByRole('button', { name: 'Novo lead' }).click();
    await expect(d).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await d.getByLabel(/^Nome/).fill(name);
  await d.getByLabel(/^Telefone/).fill(phone);
  await d.getByLabel(/^Negócio/).fill(title);
  await d.getByRole('button', { name: 'Criar lead' }).click();
  await expect(d).toBeHidden();
  await expect(page.getByRole('region', { name: 'Novo' }).getByRole('link', { name: title, exact: true })).toBeVisible();
  return { name, title, phone };
}

const COLUNAS = ['Novo', 'Em conversa', 'Avaliação agendada', 'Em negociação'];

/** Em que coluna do quadro o lead está (ou "fora do quadro", se ganho/perdido). */
export async function columnOf(page: Page, title: string): Promise<string> {
  await page.goto('/crm');
  for (const nome of COLUNAS) {
    if (await page.getByRole('region', { name: nome }).getByRole('link', { name: title, exact: true }).count()) return nome;
  }
  return 'fora do quadro';
}

/** A automação roda depois da resposta: espera o card chegar. */
export async function expectColumn(page: Page, title: string, column: string) {
  await expect.poll(() => columnOf(page, title), { timeout: 20_000, intervals: [500, 1000, 1500] }).toBe(column);
}
