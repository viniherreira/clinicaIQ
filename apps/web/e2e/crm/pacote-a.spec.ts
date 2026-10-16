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

test('exportar planilha: o menu baixa um CSV com os filtros da busca e fica na auditoria', async ({ page }) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const lead = await createLeadViaModal(page);
  const antes = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'LEADS_EXPORTED' } });

  await page.goto(`/crm/leads?q=${encodeURIComponent(lead.title)}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Mais opções' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Exportar planilha' }).click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toMatch(/^leads-dreamclin-\d{4}-\d{2}-\d{2}\.csv$/);
  const texto = (await (await arquivo.createReadStream()).toArray()).map((b) => b.toString('utf-8')).join('');
  const linhas = texto.replace(/^﻿/, '').trim().split('\r\n');
  expect(linhas[0]).toMatch(/^Negócio;Pessoa;Telefone;E-mail;Funil;Etapa;Situação/);
  expect(linhas).toHaveLength(2);
  expect(linhas[1]).toContain(lead.title);
  expect(linhas[1]).toContain('Aberto');
  expect(await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'LEADS_EXPORTED' } })).toBe(antes + 1);
});

test('importar planilha do Kommo: colunas reconhecidas, prévia, importação e auditoria', async ({ page }) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const sufixo = Date.now().toString(36);
  const campo = uniqueName('Como conheceu');
  const tag = `kommo${sufixo}`;
  const fone = () => `(11) 9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const titulos = [`Implante ${sufixo}`, `Clareamento ${sufixo}`];
  // O jeito que o Kommo exporta em português: ";" e datas com ponto.
  const csv = [
    `Título do lead;Contato principal;Telefone comercial;Venda;Etapa do lead;Tags;Criado em;Nota;${campo}`,
    `${titulos[0]};Ana Kommo;${fone()};2.500,00;Em conversa;${tag}, ${tag}b;15.10.2026 10:00:00;Quer começar em novembro;Instagram`,
    `${titulos[1]};Bia Kommo;${fone()};900;Venda ganha;${tag};01.09.2026 09:30:00;;Instagram`,
    `Sem telefone ${sufixo};Caio;;;;;;;Google`,
  ].join('\r\n');
  const antes = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'LEADS_IMPORTED' } });

  try {
    await page.goto('/crm/leads/importar');
    await page.waitForLoadState('networkidle');
    expect((await axe(page)).violations).toEqual([]);
    await page.getByLabel('Planilha de leads').setInputFiles({ name: 'kommo.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });

    await expect(page.getByRole('heading', { name: 'O que é cada coluna' })).toBeVisible();
    await expect(page.getByLabel('Coluna Contato principal vai para')).toHaveValue('name');
    await expect(page.getByLabel('Coluna Etapa do lead vai para')).toHaveValue('stage');
    await expect(page.getByLabel(`Coluna ${campo} vai para`)).toHaveValue('newField');
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByRole('heading', { name: 'Conferir antes de importar' })).toBeVisible();
    await expect(page.getByText('telefones já têm lead aberto')).toBeVisible();
    await expect(page.getByText(`Campos novos: ${campo} (lista)`)).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'Importar 2 leads' }).click();

    await expect(page.getByRole('heading', { name: 'Importação concluída' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText('2 criados');
    await page.getByText('1 aviso por linha').click();
    await expect(page.getByText('Linha 4: sem telefone')).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    const ana = await prisma.lead.findFirst({
      where: { tenantId: tenant.id, title: titulos[0] },
      include: { stage: true, tags: { include: { tag: true } } },
    });
    expect(ana).toMatchObject({ name: 'Ana Kommo', estimatedValueCents: 250000 });
    expect(ana!.stage.name).toBe('Em conversa');
    expect(ana!.createdAt.toISOString()).toBe('2026-10-15T13:00:00.000Z');
    expect(ana!.tags.map((t) => t.tag.name).sort()).toEqual([tag, `${tag}b`]);
    const bia = await prisma.lead.findFirst({ where: { tenantId: tenant.id, title: titulos[1] }, include: { stage: true } });
    expect(bia!.stage.role).toBe('WON');
    const def = await prisma.leadField.findFirst({ where: { tenantId: tenant.id, name: campo } });
    expect(def).toMatchObject({ type: 'SELECT' });
    expect(ana!.fields).toEqual({ [def!.id]: 'Instagram' });
    expect(await prisma.auditLog.count({ where: { tenantId: tenant.id, action: 'LEADS_IMPORTED' } })).toBe(antes + 1);
  } finally {
    const leads = await prisma.lead.findMany({ where: { tenantId: tenant.id, title: { in: titulos } }, select: { id: true } });
    const ids = leads.map((l) => l.id);
    await prisma.leadActivity.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.leadTagOnLead.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
    await prisma.leadTag.deleteMany({ where: { tenantId: tenant.id, name: { in: [tag, `${tag}b`] } } });
    await prisma.leadField.deleteMany({ where: { tenantId: tenant.id, name: campo } });
  }
});
