import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prisma } from '@clinicaiq/db';
import { E2E_TENANT_SLUG } from '../support/seed';

/**
 * Configurações com menu lateral por grupos: cada seção abre pelo endereço
 * (`#plano`, `#regras`…), sem violações de acessibilidade, e as regras novas
 * (agenda e formas de recebimento) valem nas telas.
 */
const axe = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

const SECOES: [string, string][] = [
  ['clinica', 'Dados da clínica'],
  ['unidades', 'Unidades'],
  ['equipe', 'Usuários e acessos'],
  ['profissionais', 'Profissionais'],
  ['horarios', 'Horário de funcionamento'],
  ['regras', 'Regras da agenda'],
  ['rotulos', 'Rótulos'],
  ['online', 'Agendamento online'],
  ['documentos', 'Documentos'],
  ['pagamentos', 'Formas de recebimento'],
  ['comunicacao', 'WhatsApp e mensagens'],
  ['privacidade', 'Privacidade e LGPD'],
];

test('cada seção abre pelo menu e pelo endereço, sem violações', async ({ page }) => {
  await page.goto('/configuracoes#regras');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('region', { name: 'Configurações: Regras da agenda' })).toBeVisible();
  // Endereço antigo das abas: #atendimento cai no horário de funcionamento.
  await page.goto('/configuracoes#atendimento');
  await expect(page.getByRole('region', { name: 'Configurações: Horário de funcionamento' })).toBeVisible();

  const menu = page.getByRole('navigation', { name: 'Seções das configurações' });
  for (const [, nome] of SECOES) {
    await menu.getByRole('link', { name: new RegExp(`^${nome}`) }).click();
    await expect(page.getByRole('region', { name: `Configurações: ${nome}` })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect((await axe(page)).violations, nome).toEqual([]);
  }
});

test('regras da agenda e formas de recebimento valem nas telas', async ({ page }) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const antes = tenant.settings;
  try {
    await page.goto('/configuracoes#regras');
    const regras = page.getByRole('region', { name: 'Configurações: Regras da agenda' });
    await regras.getByLabel('A agenda começa às').selectOption('6');
    await regras.getByLabel('Intervalo da grade').selectOption('15');
    await regras.getByLabel('Duração padrão do agendamento').fill('45');
    await regras.getByRole('button', { name: 'Salvar regras' }).click();
    await expect(regras.getByText('Regras salvas.')).toBeVisible();

    // A grade começa às 06:00 e o agendamento novo dura 45 min.
    await page.goto('/agenda');
    await expect(page.getByText('06:00', { exact: true }).first()).toBeAttached();
    await page.getByRole('button', { name: 'Novo agendamento (N)' }).click();
    const modal = page.getByRole('dialog', { name: 'Novo agendamento' });
    await modal.getByLabel(/^Início/).fill('09:00');
    await expect(modal.getByLabel(/^Fim/)).toHaveValue('09:45');
    await modal.getByRole('button', { name: 'Cancelar' }).click();

    await page.goto('/configuracoes#pagamentos');
    const formas = page.getByRole('region', { name: 'Configurações: Formas de recebimento' });
    await formas.getByLabel('Nova forma').fill('Convênio E2E');
    await formas.getByRole('button', { name: 'Adicionar' }).click();
    await formas.getByRole('button', { name: 'Tirar Boleto' }).click();
    await formas.getByRole('button', { name: 'Salvar formas' }).click();
    await expect(formas.getByText('Formas salvas.')).toBeVisible();
    const salvo = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { settings: true } });
    const lista = (salvo.settings as { paymentMethods?: string[] }).paymentMethods ?? [];
    expect(lista).toContain('Convênio E2E');
    expect(lista).not.toContain('Boleto');
  } finally {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: (antes ?? {}) as object } });
  }
});
