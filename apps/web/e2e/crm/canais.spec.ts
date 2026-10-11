import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { decrypt, encrypt, prisma } from '@clinicaiq/db';
import { uniqueName } from '../support/helpers';
import { E2E_TENANT_SLUG } from '../support/seed';
import { createLeadViaModal } from './helpers';

/**
 * API oficial (webhook da Meta), transmissões e as abas de automações e robô.
 *
 * O webhook usa uma clínica descartável: ligar a API oficial na clínica de
 * teste mudaria o canal dos outros testes que rodam em paralelo.
 */

const secret = process.env.META_APP_SECRET;
const verify = process.env.META_WEBHOOK_VERIFY_TOKEN;

test.describe('webhook da API oficial', () => {
  test.skip(!secret || !verify, 'Sem META_APP_SECRET/META_WEBHOOK_VERIFY_TOKEN no .env.local.');

  test('aperto de mão, assinatura e mensagem gravada na clínica do número', async ({ request }) => {
    const key = process.env.ENCRYPTION_MASTER_KEY!;
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const pn = `9${Date.now()}`.slice(0, 15);
    const tenant = await prisma.tenant.create({ data: { clerkOrgId: `meta_${suffix}`, name: 'Meta E2E', slug: `meta-${suffix}` } });
    await prisma.subscription.create({
      data: { tenantId: tenant.id, tier: 'PROFISSIONAL', status: 'ACTIVE', currentPeriodEnd: new Date('2099-01-01'), complimentary: true },
    });
    await prisma.whatsAppCloudAccount.create({
      data: { tenantId: tenant.id, wabaId: 'WABA', phoneNumberId: pn, accessTokenEncrypted: encrypt('x', key, tenant.id) },
    });

    try {
      const hs = await request.get(`/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${verify}&hub.challenge=4242`);
      expect(await hs.text()).toBe('4242');
      expect((await request.get('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1')).status()).toBe(403);

      const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WABA',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: pn },
                  contacts: [{ wa_id: '5511912340000', profile: { name: 'Contato Meta' } }],
                  messages: [{ from: '5511912340000', id: `wamid.E2E${suffix}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Oi, vim pelo anúncio' } }],
                },
              },
            ],
          },
        ],
      });
      const sign = (b: string) => 'sha256=' + createHmac('sha256', secret!).update(b).digest('hex');

      const semAssinatura = await request.post('/api/webhooks/meta', { data: body, headers: { 'content-type': 'application/json' } });
      expect(semAssinatura.status()).toBe(401);

      const ok = await request.post('/api/webhooks/meta', { data: body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) } });
      expect(ok.status()).toBe(200);

      const conv = await prisma.conversation.findFirst({ where: { tenantId: tenant.id }, include: { messages: true } });
      expect(conv).toMatchObject({ contactName: 'Contato Meta', unreadCount: 1 });
      expect(conv?.lastInboundAt).not.toBeNull();
      expect(decrypt(conv!.messages[0].textEncrypted!, key, tenant.id)).toBe('Oi, vim pelo anúncio');
      // A mesma entrega de novo (a Meta reenvia) não duplica.
      await request.post('/api/webhooks/meta', { data: body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) } });
      expect(await prisma.chatMessage.count({ where: { tenantId: tenant.id } })).toBe(1);
    } finally {
      const t = { tenantId: tenant.id };
      await prisma.chatMessage.deleteMany({ where: t });
      await prisma.conversation.deleteMany({ where: t });
      await prisma.whatsAppCloudAccount.deleteMany({ where: t });
      await prisma.subscription.deleteMany({ where: t });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
  });
});

test('transmissão para uma tag: público contado, fila e detalhes', async ({ page }) => {
  test.setTimeout(180_000);
  const lead = await createLeadViaModal(page);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  const nomeTag = uniqueName('tag').toLowerCase().replace(/\s+/g, '-');
  const tag = await prisma.leadTag.create({ data: { tenantId: tenant.id, name: nomeTag, color: 'violet' } });
  const l = await prisma.lead.findFirstOrThrow({ where: { tenantId: tenant.id, title: lead.title } });
  await prisma.leadTagOnLead.create({ data: { tenantId: tenant.id, leadId: l.id, tagId: tag.id } });

  await page.goto('/crm/transmissoes/nova');
  await page.waitForLoadState('networkidle');
  const nome = uniqueName('Transmissão E2E');
  await page.getByLabel('Nome (só para a equipe)').fill(nome);
  await page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: nomeTag }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 pessoa recebe' })).toBeVisible();
  await page.getByLabel(/^Texto/).fill('Oi {nome}! Temos horário na quinta.');
  await expect(page.getByText(`Oi Ana! Temos horário na quinta.`)).toBeVisible();
  await page.getByRole('button', { name: 'Enviar para 1 pessoa' }).click();

  await page.waitForURL(/\/crm\/transmissoes\/(?!nova)[^/]+$/);
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('row', { name: new RegExp(lead.name) })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});

test('automações e robô: criar pela tela', async ({ page }) => {
  await page.goto('/crm/configuracoes');
  await page.waitForLoadState('networkidle');

  await page.getByRole('tab', { name: 'Automações' }).click();
  await page.getByRole('button', { name: 'Adicionar automação em Em negociação' }).click();
  await page.getByLabel('O que fazer').selectOption('ADD_TAG');
  const semTag = await page.getByText('Crie uma tag primeiro').count();
  if (semTag === 0) {
    await page.getByRole('button', { name: 'Criar automação' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Automação criada.' })).toBeVisible();
    await expect(page.getByText(/Na hora:.*Põe a tag/).first()).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Robô' }).click();
  await page.getByRole('button', { name: 'Novo robô' }).click();
  const nome = uniqueName('Robô E2E');
  await page.getByLabel('Nome do robô').fill(nome);
  await page.getByLabel('Quando responde').selectOption('KEYWORD');
  await page.getByLabel(/^Palavras-chave/).fill(`e2e${Date.now()}`);
  // Desligado: um robô ligado responderia nos outros testes.
  await page.getByRole('checkbox', { name: 'Ligado' }).uncheck();
  await page.getByRole('button', { name: 'Salvar robô' }).click();
  await expect(page.getByRole('button', { name: `Editar ${nome}` })).toBeVisible();

  // Limpa o que criou: o funil e as conversas dos outros testes não podem mudar.
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  await prisma.stageAutomation.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.chatbotFlow.deleteMany({ where: { tenantId: tenant.id, name: nome } });
});
