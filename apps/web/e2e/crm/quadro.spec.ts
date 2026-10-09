import { test, expect } from '@playwright/test';
import { createLeadViaModal, expectColumn, uniquePhone } from './helpers';

test('mover pelo teclado: alça do card, seta para a direita, Espaço', async ({ page }) => {
  const lead = await createLeadViaModal(page);
  // No ritmo de uma pessoa: o dnd-kit mede as colunas logo depois de pegar o card.
  const tecla = async (k: string) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(250);
  };
  await page.getByRole('button', { name: `Arrastar ${lead.name}` }).focus();
  await tecla('Space');
  await tecla('ArrowRight');
  await tecla('Space');
  await expect(page.getByRole('region', { name: 'Em conversa' }).getByRole('link', { name: lead.title, exact: true })).toBeVisible();
  await expectColumn(page, lead.title, 'Em conversa');
});

test('menu "Mover para…" e perda com motivo obrigatório', async ({ page }) => {
  const lead = await createLeadViaModal(page);
  await page.getByRole('button', { name: `Mover ${lead.name} para…` }).click();
  await page.getByRole('menuitem', { name: 'Avaliação agendada' }).click();
  await expectColumn(page, lead.title, 'Avaliação agendada');

  await page.getByRole('button', { name: `Mover ${lead.name} para…` }).click();
  await page.getByRole('menuitem', { name: /Perdido/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Por que perdemos este lead?' });
  await dialog.getByRole('button', { name: 'Marcar como perdido' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Escolha um motivo.');
  await dialog.getByRole('radio', { name: 'Achou caro' }).check();
  await dialog.getByRole('button', { name: 'Marcar como perdido' }).click();
  await expectColumn(page, lead.title, 'fora do quadro');

  await page.goto('/crm/leads?situacao=perdidos');
  await expect(page.getByRole('link', { name: lead.title, exact: true })).toBeVisible();
});

test('telefone de lead aberto avisa duplicado, digitado de outro jeito', async ({ page }) => {
  const phone = uniquePhone();
  const lead = await createLeadViaModal(page, { phone });
  await page.getByRole('button', { name: 'Novo lead' }).click();
  const d = page.getByRole('dialog', { name: 'Novo lead' });
  await d.getByLabel(/^Nome/).fill('Outra pessoa');
  await d.getByLabel(/^Telefone/).fill(`(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`);
  await d.getByRole('button', { name: 'Criar lead' }).click();
  await expect(d.getByText(`Já existe um lead aberto com esse telefone: ${lead.name}.`)).toBeVisible();
});

test('ficha: tarefa, nota e conclusão ficam no histórico', async ({ page }) => {
  const lead = await createLeadViaModal(page);
  await page.getByRole('link', { name: lead.title, exact: true }).click();
  await page.waitForURL(/\/crm\/leads\/[^/]+$/);

  await page.getByLabel('O que fazer').fill('Ligar para tirar dúvidas');
  await page.getByRole('button', { name: 'Agendar tarefa' }).click();
  await expect(page.getByRole('button', { name: 'Concluir tarefa: Ligar para tirar dúvidas' })).toBeVisible();

  await page.getByRole('tab', { name: 'Nota' }).click();
  await page.getByRole('textbox', { name: 'Nota' }).fill('Prefere atendimento à tarde.');
  await page.getByRole('button', { name: 'Salvar nota' }).click();
  await expect(page.getByText('Prefere atendimento à tarde.')).toBeVisible();

  await page.getByRole('button', { name: 'Concluir tarefa: Ligar para tirar dúvidas' }).click();
  await expect(page.getByText('Tarefa concluída: Ligar para tirar dúvidas')).toBeVisible();
});
