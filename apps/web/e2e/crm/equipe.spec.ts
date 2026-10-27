import { test, expect } from '@playwright/test';
import { prisma } from '@clinicaiq/db';
import { incomingMessage } from './chat';
import { uniquePhone } from './helpers';
import { E2E_TENANT_SLUG } from '../support/seed';

/**
 * CRM › Equipe e distribuição, e o responsável da conversa (Assumir / Atende).
 * A distribuição volta a ficar desligada no fim: os outros testes não contam com ela.
 */
test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG }, select: { id: true, settings: true } });
  const s = (t.settings && typeof t.settings === 'object' ? t.settings : {}) as Record<string, unknown>;
  await prisma.tenant.update({ where: { id: t.id }, data: { settings: { ...s, crmDistribution: { enabled: false, mode: 'rotation', onlyAvailable: true } } } });
});

test('a equipe do CRM mostra o dono como Gestor e salva a distribuição', async ({ page }) => {
  await page.goto('/crm/equipe');
  await expect(page.getByRole('heading', { name: 'Equipe e distribuição' })).toBeVisible();
  const equipe = page.getByRole('region', { name: 'Quem usa o CRM' });
  await expect(equipe.getByText('Dono E2E')).toBeVisible();
  await expect(equipe.getByText('Gestor').first()).toBeVisible();

  const dist = page.getByRole('region', { name: 'Distribuição de leads' });
  await dist.getByRole('switch').check();
  await dist.getByText('Menos ocupado').click();
  await dist.getByRole('button', { name: 'Salvar distribuição' }).click();
  await expect(dist.getByText('Distribuição salva.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Distribuição de leads' }).getByRole('switch')).toBeChecked();
});

test('o menu do CRM tem Equipe, e o topo tem Disponível', async ({ page }) => {
  await page.goto('/crm');
  await expect(page.getByRole('link', { name: /Equipe/ }).first()).toBeVisible();
  await expect(page.getByRole('switch', { name: /Disponível|Ausente/ })).toBeVisible();
});

test('conversa sem responsável: Assumir e ela passa a ser sua', async ({ page }) => {
  const id = await incomingMessage(uniquePhone(), 'Contato Fila E2E', 'Oi, quero saber preço');
  await prisma.conversation.update({ where: { id }, data: { assignedToId: null } });
  await page.goto(`/crm/conversas?c=${id}`);
  const assumir = page.getByRole('button', { name: 'Assumir' });
  await expect(assumir).toBeVisible();
  await assumir.click();
  await expect(page.getByLabel('Atende:')).toHaveValue(/.+/);
  await expect(assumir).toBeHidden();
  const conv = await prisma.conversation.findUnique({ where: { id } });
  expect(conv?.assignedToId).not.toBeNull();
});
