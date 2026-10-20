import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prisma } from '@clinicaiq/db';
import { uniqueName } from '../support/helpers';
import { E2E_TENANT_SLUG } from '../support/seed';

/**
 * O robô em quadro, no jeito do Salesbot do Kommo: modelos, caixas ligadas por
 * setas, painel do passo, teste com o passo aceso, vista em lista e gatilhos.
 * Os robôs criados aqui ficam desligados e saem no fim.
 */
const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // O minimapa é um desenho (svg) só de apoio; o quadro tem a vista em lista.
    .exclude('.react-flow__minimap')
    .analyze();

const nomes: string[] = [];
test.afterAll(async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  await prisma.chatbotFlow.deleteMany({ where: { tenantId: tenant.id, name: { in: nomes } } });
});

async function abrirModelo(page: Page, modelo: RegExp) {
  await page.goto('/crm/automacoes/bots');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Novo robô' }).click();
  await page.getByRole('link', { name: modelo }).click();
  await page.waitForURL(/\/crm\/automacoes\/bots\/novo/);
  await expect(page.locator('.react-flow__node-step').first()).toBeVisible();
}

test('modelo no quadro: caixas, painel do passo, teste com botão e sinônimo, salvar e voltar à lista', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirModelo(page, /Boas-vindas com menu/);
  expect(await page.locator('.react-flow__node-step').count()).toBeGreaterThanOrEqual(10);
  expect((await axe(page)).violations).toEqual([]);

  // Clicar na caixa abre o painel do passo.
  await page.locator('.react-flow__node-step').filter({ hasText: 'Como posso te ajudar?' }).click();
  await expect(page.getByRole('heading', { name: 'Passo 1 · Mensagem' })).toBeVisible();
  await expect(page.getByLabel('Texto do botão 2')).toHaveValue('Valores');
  expect((await axe(page)).violations).toEqual([]);

  // Testar: o nome da pessoa, o botão tocado e o sinônimo escrito.
  await page.getByRole('button', { name: 'Testar' }).click();
  const log = page.getByRole('log', { name: 'Conversa de teste' });
  await expect(log).toContainText('Oi, Ana! Aqui é da sua clínica.');
  await page.getByLabel('Responder como a pessoa').fill('quanto custa?');
  await page.getByLabel('Responder como a pessoa').press('Enter');
  await expect(log).toContainText('Os valores dependem da avaliação');
  await page.getByLabel('Responder como a pessoa').fill('estou com muita dor');
  await page.getByLabel('Responder como a pessoa').press('Enter');
  await expect(log).toContainText('Já vou chamar alguém da equipe agora');
  await expect(log).toContainText('Aviso para a equipe: Paciente com urgência no WhatsApp');
  expect((await axe(page)).violations).toEqual([]);

  // Salvar (desligado, por palavra única, para não responder nos outros testes).
  const nome = uniqueName('Quadro E2E');
  nomes.push(nome);
  await page.getByLabel('Nome do robô').fill(nome);
  await page.getByRole('button', { name: 'Gatilho e público' }).click();
  await page.getByRole('radio', { name: /Palavra-chave/ }).check();
  await page.getByLabel(/^Palavras-chave/).fill(`quadro${Date.now()}`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.waitForURL(/\/crm\/automacoes\/bots\/(?!novo)[^/]+$/);
  await expect(page.getByRole('button', { name: 'Salvo' })).toBeVisible();

  await page.getByRole('link', { name: 'Robôs' }).click();
  const card = page.getByRole('listitem').filter({ hasText: nome });
  await expect(card).toContainText('passos');
  await expect(page.getByRole('link', { name: `Editar ${nome}` })).toBeVisible();
  const salvo = await prisma.chatbotFlow.findFirst({ where: { name: nome } });
  expect(salvo?.active).toBe(false);
  expect((salvo?.steps as { version?: number }).version).toBe(2);
});

test('vista em lista: criar e ligar passos pelo teclado', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirModelo(page, /Em branco/);
  await page.getByRole('button', { name: 'Lista' }).click();
  const lista = page.getByRole('list', { name: 'Passos do robô' });
  await expect(lista.getByRole('heading', { name: /Passo 1 · Mensagem/ })).toBeVisible();
  await page.getByLabel('Adicionar passo').selectOption({ label: 'Passar para a equipe' });
  // O passo novo abre no painel; liga a saída "Seguir" do passo 1 a ele pela lista.
  await page.getByLabel('Seguir →').first().selectOption({ label: 'Passo 2 · Passar para a equipe' });
  expect((await axe(page)).violations).toEqual([]);

  await page.getByRole('button', { name: 'Testar' }).click();
  const log = page.getByRole('log', { name: 'Conversa de teste' });
  await expect(log).toContainText('Já vou chamar alguém da equipe para te ajudar');
  await expect(log).toContainText('a equipe assume a conversa');

  await page.getByRole('button', { name: 'Quadro' }).click();
  // A seta de início e a nova ligação.
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
});

test('gatilho "lead entra numa etapa": sem etapa não salva; com etapa, salva', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirModelo(page, /Em branco/);
  const nome = uniqueName('Etapa E2E');
  nomes.push(nome);
  await page.getByLabel('Nome do robô').fill(nome);
  await page.getByRole('radio', { name: /Lead entra numa etapa/ }).check();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Escolha em quais etapas o robô começa.' })).toBeVisible();
  await page.getByRole('group', { name: 'Etapas do gatilho' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.waitForURL(/\/crm\/automacoes\/bots\/(?!novo)[^/]+$/);
  // A pílula de começo diz o gatilho.
  await expect(page.locator('.react-flow__node-start')).toContainText('Lead entra em');
  const salvo = await prisma.chatbotFlow.findFirst({ where: { name: nome } });
  expect(salvo?.trigger).toBe('STAGE');
});
