import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { incomingMessage } from './chat';
import { createLeadViaModal } from './helpers';

/**
 * WCAG 2.1 AA nas telas do CRM e na agenda com o seletor Clínica | CRM.
 * Acessibilidade é diferencial do produto: o CRM não pode ser a exceção.
 */
const axe = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

for (const path of [
  '/crm',
  '/crm/conversas',
  '/crm/leads',
  '/crm/painel',
  '/crm/tarefas',
  '/crm/automacoes/transmissoes',
  '/crm/automacoes/transmissoes/nova',
  '/crm/automacoes/bots',
  '/crm/automacoes/modelos',
  '/crm/automacoes/etapas',
  '/crm?editar=1',
  '/crm/whatsapp',
  '/crm/configuracoes',
  '/dashboard',
]) {
  test(`${path} sem violações de acessibilidade`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect((await axe(page)).violations).toEqual([]);
  });
}

// Na agenda, só o que o CRM acrescentou (o seletor). O minicalendário da
// agenda tem um problema de contraste anterior ao CRM, tratado à parte.
test('/agenda: o seletor Clínica | CRM sem violações', async ({ page }) => {
  await page.goto('/agenda');
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page })
    .include('nav[aria-label="Trocar de módulo"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(r.violations).toEqual([]);
});

test('ficha do lead e modais sem violações', async ({ page }) => {
  const lead = await createLeadViaModal(page);

  await page.getByRole('button', { name: 'Novo lead' }).click();
  await expect(page.getByRole('dialog', { name: 'Novo lead' })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: lead.title, exact: true }).click();
  await page.waitForURL(/\/crm\/leads\/[^/]+$/);
  await page.waitForLoadState('networkidle');
  expect((await axe(page)).violations).toEqual([]);
});

test('conversa aberta e aba Conversa da ficha sem violações', async ({ page }) => {
  const lead = await createLeadViaModal(page);
  await incomingMessage(lead.phone, 'Contato a11y', 'Oi, tudo bem?');

  await page.goto('/crm/conversas');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: new RegExp(lead.name) }).click();
  await expect(page.getByRole('region', { name: `Conversa com ${lead.name}` }).getByText('Oi, tudo bem?')).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);

  await page.getByRole('combobox', { name: 'Mensagem' }).fill('/');
  expect((await axe(page)).violations).toEqual([]);

  await page.goto('/crm');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: lead.title, exact: true }).click();
  await page.waitForURL(/\/crm\/leads\/[^/]+$/);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: /Conversa/ }).click();
  await expect(page.getByText('Oi, tudo bem?')).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test('automações por etapa e bots (com o editor aberto) sem violações', async ({ page }) => {
  await page.goto('/crm/automacoes/etapas');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Adicionar automação em/ }).first().click();
  expect((await axe(page)).violations).toEqual([]);
  await page.goto('/crm/automacoes/bots');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Novo robô' }).click();
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole('button', { name: /Fora do horário/ }).click();
  await expect(page.getByRole('log', { name: 'Conversa de teste' })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test('painel de filtros do funil sem violações', async ({ page }) => {
  await page.goto('/crm');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /abrir filtros/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});
