import { expect, type Page } from '@playwright/test';

/** Nome único por execução: os testes rodam em paralelo e no mesmo banco. */
export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Data de amanhã no formato do campo `date` e do parâmetro `?date=` da agenda. */
export function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Cadastra um paciente pela tela e devolve o id (tirado da URL da ficha). */
export async function createPatient(page: Page, name: string): Promise<string> {
  await page.goto('/pacientes/novo');
  await page.getByLabel('Nome completo').fill(name);
  await page.getByLabel('Telefone principal').fill('11987654321');
  await page.getByRole('checkbox', { name: /autoriza o armazenamento/ }).check();
  await page.getByRole('button', { name: 'Cadastrar paciente' }).click();

  await page.waitForURL(/\/pacientes\/(?!novo)[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return page.url().split('/').pop()!;
}
