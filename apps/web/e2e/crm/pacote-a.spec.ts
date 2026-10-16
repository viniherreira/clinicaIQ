import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prisma } from '@clinicaiq/db';
import { uniqueName } from '../support/helpers';
import { E2E_TENANT_SLUG } from '../support/seed';
import { createLeadViaModal } from './helpers';

/**
 * Pacote A do CRM (no jeito do Kommo): campos personalizados, lista com
 * colunas e ações em massa. O campo e a tag criados aqui saem no fim.
 */
const axe = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

test('campo personalizado: criar, preencher na ficha, ver no histórico e na lista', async ({ page }) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const nomeCampo = uniqueName('Convênio E2E');
  try {
    await page.goto('/crm/configuracoes?aba=campos');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Novo campo' }).click();
    const form = page.getByRole('form', { name: 'Novo campo' });
    await form.getByLabel('Nome do campo').fill(nomeCampo);
    await form.getByLabel('Tipo').selectOption('SELECT');
    await form.getByLabel(/^Opções/).fill('Amil\nUnimed');
    await form.getByRole('checkbox', { name: 'Mostrar no card do funil' }).check();
    expect((await axe(page)).violations).toEqual([]);
    await form.getByRole('button', { name: 'Salvar campo' }).click();
    await expect(page.getByRole('button', { name: `Editar o campo ${nomeCampo}` })).toBeVisible();

    const lead = await createLeadViaModal(page);
    await page.getByRole('region', { name: 'Novo' }).getByRole('link', { name: lead.title, exact: true }).click();
    await page.waitForURL(/\/crm\/leads\/[^/]+$/);
    await page.getByRole('combobox', { name: nomeCampo }).selectOption('Unimed');
    await expect(page.getByText(`${nomeCampo}: Unimed`).first()).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    // Lista: a coluna do campo aparece pelo botão Colunas.
    await page.goto('/crm/leads');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Colunas' }).click();
    await page.getByRole('checkbox', { name: nomeCampo }).check();
    await expect(page.getByRole('columnheader', { name: nomeCampo })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(lead.title) })).toContainText('Unimed');
    await page.keyboard.press('Escape');
    expect((await axe(page)).violations).toEqual([]);
  } finally {
    await prisma.leadField.deleteMany({ where: { tenantId: tenant.id, name: nomeCampo } });
  }
});

test('ações em massa: marcar dois leads e pôr uma tag nos dois', async ({ page }) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const nomeTag = `massa${Date.now().toString(36)}`;
  const tag = await prisma.leadTag.create({ data: { tenantId: tenant.id, name: nomeTag, color: 'teal' } });
  try {
    const a = await createLeadViaModal(page);
    const b = await createLeadViaModal(page);
    await page.goto('/crm/leads');
    await page.waitForLoadState('networkidle');
    await page.getByRole('checkbox', { name: `Marcar ${a.title}` }).check();
    await page.getByRole('checkbox', { name: `Marcar ${b.title}` }).check();
    const barra = page.getByRole('region', { name: 'Ações nos leads marcados' });
    await expect(barra).toContainText('2 marcados');
    await barra.getByLabel('Ação').selectOption('addTag');
    await barra.getByLabel('Tag').selectOption({ label: nomeTag });
    expect((await axe(page)).violations).toEqual([]);
    await barra.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('status').filter({ hasText: '2 com a tag.' })).toBeVisible();
    await expect.poll(() => prisma.leadTagOnLead.count({ where: { tagId: tag.id } })).toBe(2);
  } finally {
    await prisma.leadTagOnLead.deleteMany({ where: { tagId: tag.id } });
    await prisma.leadActivity.deleteMany({ where: { tenantId: tenant.id, type: { in: ['TAG_ADDED'] }, data: { path: ['tagId'], equals: tag.id } } });
    await prisma.leadTag.deleteMany({ where: { id: tag.id } });
  }
});
