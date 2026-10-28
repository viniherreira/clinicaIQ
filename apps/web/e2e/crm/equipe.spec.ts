import { test, expect } from '@playwright/test';
import { prisma } from '@clinicaiq/db';
import { incomingMessage } from './chat';
import { uniquePhone } from './helpers';
import { E2E_TENANT_SLUG } from '../support/seed';

/**
 * CRM › Configurações (equipe, permissões, distribuição, preferências) e o responsável da conversa (Assumir / Atende).
 * A distribuição volta a ficar desligada no fim: os outros testes não contam com ela.
 */
test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG }, select: { id: true, settings: true } });
  const s = (t.settings && typeof t.settings === 'object' ? t.settings : {}) as Record<string, unknown>;
  await prisma.tenant.update({ where: { id: t.id }, data: { settings: { ...s, crmDistribution: { enabled: false, mode: 'rotation', onlyAvailable: true } } } });
});

test('Configurações › Equipe e permissões: o dono é Gestor e a permissão de uma pessoa muda pelo quadro', async ({ page }) => {
  await page.goto('/crm/equipe');
  await expect(page).toHaveURL(/\/crm\/configuracoes/);
  const equipe = page.getByRole('region', { name: 'Gestão de usuários' });
  await expect(equipe.getByRole('row', { name: /Dono E2E/ })).toContainText('Gestor');

  await equipe.getByRole('button', { name: /Recepção E2E/ }).click();
  const gaveta = page.getByRole('dialog', { name: 'Recepção E2E' });
  await gaveta.getByLabel('Negócios e conversas: Exportar').selectOption('all');
  await expect(gaveta.getByText('Personalizado')).toBeVisible();
  await gaveta.getByRole('button', { name: 'Gestor' }).click();
  await gaveta.getByRole('button', { name: 'Atendente', exact: true }).click();
  await gaveta.getByRole('button', { name: 'Cancelar' }).click();
  await expect(gaveta).toBeHidden();
});

test('Configurações › Distribuição salva', async ({ page }) => {
  await page.goto('/crm/configuracoes#distribuicao');
  const dist = page.getByRole('region', { name: 'Distribuição de leads' });
  await dist.getByRole('switch').check();
  await dist.getByText('Menos ocupado').click();
  await dist.getByRole('button', { name: 'Salvar distribuição' }).click();
  await expect(dist.getByText('Distribuição salva.')).toBeVisible();
});

test('Configurações › Geral salva as preferências', async ({ page }) => {
  await page.goto('/crm/configuracoes#conversas');
  const sec = page.getByRole('region', { name: 'Ferramentas de conversa' });
  const chave = sec.getByRole('switch', { name: /Mostrar o nome/ });
  // Liga e desliga a partir do estado salvo, e devolve como estava.
  const antes = await chave.isChecked();
  await chave.setChecked(!antes);
  await sec.getByRole('button', { name: 'Salvar' }).click();
  await expect(sec.getByText('Configurações salvas.')).toBeVisible();
  await chave.setChecked(antes);
  await sec.getByRole('button', { name: 'Salvar' }).click();
  await expect(sec.getByText('Configurações salvas.')).toBeVisible();
});

test('o menu do CRM tem Configurações, e o topo tem Disponível', async ({ page }) => {
  await page.goto('/crm');
  await expect(page.getByRole('link', { name: /Configurações/ }).first()).toBeVisible();
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
