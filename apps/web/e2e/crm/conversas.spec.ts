import { deflateSync } from 'node:zlib';
import { test, expect } from '@playwright/test';
import { uniqueName } from '../support/helpers';
import { incomingMessage } from './chat';
import { columnOf, createLeadViaModal, uniquePhone } from './helpers';

/**
 * As conversas do WhatsApp no CRM. O gateway não roda nos testes: a mensagem
 * que chega é gravada direto no banco, como ele gravaria, e a resposta é dada
 * como enviada (sem gateway, o app simula).
 */

test('contato sem card: sem Entrada nem formulário, "Abrir negócio" cria o lead em Novo com um clique', async ({ page }) => {
  // No app, número novo já vira lead sozinho ao chegar (crm/inbound.ts). Aqui a
  // mensagem é gravada direto no banco, sem esse passo: sobra o contato sem card.
  const nome = uniqueName('Contato E2E');
  await incomingMessage(uniquePhone(), nome, 'Oi! Quanto custa o clareamento?');

  await page.goto('/crm/conversas');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('group', { name: 'Filtrar conversas' }).getByRole('button', { name: 'Entrada' })).toHaveCount(0);
  await page.getByRole('list', { name: 'Lista de conversas' }).getByRole('button', { name: new RegExp(nome) }).click();

  const contato = page.getByRole('complementary', { name: 'Contato da conversa' });
  await expect(contato.getByRole('form')).toHaveCount(0);
  await contato.getByRole('button', { name: 'Abrir negócio' }).click();
  await expect(page.getByRole('complementary', { name: 'Dados do lead' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/crm');
  await page.waitForLoadState('networkidle');
  await expect.poll(() => columnOf(page, nome), { timeout: 20_000 }).toBe('Novo');
});

test('responder pela tela Conversas e ver na ficha do lead', async ({ page }) => {
  // Passa por cinco telas; no servidor de desenvolvimento, dividido com outros testes, demora.
  test.setTimeout(240_000);
  const lead = await createLeadViaModal(page);
  await incomingMessage(lead.phone, 'Apelido no Zap', 'Tem horário amanhã?');

  await page.goto('/crm/conversas');
  await page.waitForLoadState('networkidle');
  // A conversa já aparece com o nome do lead, não o do WhatsApp.
  await page.getByRole('button', { name: new RegExp(lead.name) }).click();
  const conversa = page.getByRole('region', { name: `Conversa com ${lead.name}` });
  await expect(conversa.getByText('Tem horário amanhã?')).toBeVisible();
  await expect(conversa.getByRole('link', { name: new RegExp(lead.title) })).toBeVisible();
  // A página não rola: os textos de leitor de tela da lista comprida não podem esticá-la.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);

  const resposta = `Tenho às 15h ${Date.now()}`;
  await conversa.getByRole('combobox', { name: 'Mensagem' }).fill(resposta);
  await page.keyboard.press('Enter');
  const bolha = conversa.getByRole('listitem').filter({ hasText: resposta });
  await expect(bolha).toBeVisible();
  // Sem gateway, a mensagem é dada como enviada logo depois.
  await expect(bolha.getByText('Enviada')).toBeAttached({ timeout: 20_000 });

  await conversa.getByRole('link', { name: new RegExp(lead.title) }).click();
  await page.waitForURL(/\/crm\/leads\/[^/]+$/);
  await page.waitForLoadState('networkidle');
  // Na ficha, a conversa aparece direto, no meio do histórico.
  await expect(page.getByText('Tem horário amanhã?')).toBeVisible();
  await expect(page.getByText(resposta)).toBeVisible();
});

/** Uma foto de verdade (PNG 24×16, azul), feita na hora: o navegador precisa conseguir desenhar. */
function png(): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, sum]);
  };
  const [w, h] = [24, 16];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, Buffer.from([22, 105, 199]))]);
  const idat = deflateSync(Buffer.concat(Array.from({ length: h }, () => linha)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png();

test('mandar uma foto com legenda pela conversa', async ({ page }) => {
  test.setTimeout(180_000);
  const lead = await createLeadViaModal(page);
  await incomingMessage(lead.phone, 'Contato da foto', 'Pode mandar o raio-x?');

  await page.goto('/crm/conversas');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: new RegExp(lead.name) }).click();
  const conversa = page.getByRole('region', { name: `Conversa com ${lead.name}` });
  await expect(conversa.getByText('Pode mandar o raio-x?')).toBeVisible();

  await conversa.locator('input[type=file]').setInputFiles({ name: 'raio-x.png', mimeType: 'image/png', buffer: PNG });
  await expect(conversa.getByText('raio-x.png')).toBeVisible();
  const legenda = `Segue o raio-x ${Date.now()}`;
  await conversa.getByRole('combobox', { name: 'Mensagem' }).fill(legenda);
  await page.keyboard.press('Enter');

  const bolha = conversa.getByRole('listitem').filter({ hasText: legenda });
  await expect(bolha).toBeVisible();
  const foto = bolha.getByRole('img');
  await expect(foto).toBeVisible();
  await expect.poll(() => foto.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(bolha.getByText('Enviada')).toBeAttached({ timeout: 20_000 });
});

test('arquivo de tipo que não vai pelo WhatsApp é recusado na hora', async ({ page }) => {
  const lead = await createLeadViaModal(page);
  await incomingMessage(lead.phone, 'Contato do zip', 'Oi');
  await page.goto('/crm/conversas');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: new RegExp(lead.name) }).click();
  const conversa = page.getByRole('region', { name: `Conversa com ${lead.name}` });
  await conversa.locator('input[type=file]').setInputFiles({ name: 'fotos.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') });
  await expect(conversa.getByRole('alert')).toContainText('Esse tipo de arquivo não vai pelo WhatsApp');
});
