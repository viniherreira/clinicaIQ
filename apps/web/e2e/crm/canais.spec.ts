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

  await page.goto('/crm/automacoes/transmissoes/nova');
  await page.waitForLoadState('networkidle');
  const nome = uniqueName('Transmissão E2E');
  await page.getByLabel('Nome (só para a equipe)').fill(nome);
  await page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: nomeTag }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 pessoa recebe' })).toBeVisible();
  await page.getByLabel(/^Texto/).fill('Oi {nome}! Temos horário na quinta.');
  await expect(page.getByText(`Oi Ana! Temos horário na quinta.`)).toBeVisible();
  await page.getByRole('button', { name: 'Enviar para 1 pessoa' }).click();

  await page.waitForURL(/\/crm\/automacoes\/transmissoes\/(?!nova)[^/]+$/);
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('row', { name: new RegExp(lead.name) })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});

test('automações e robô: criar pela tela', async ({ page }) => {
  // Funil digital: um gatilho com condição, que aparece como cartão na coluna.
  await page.goto('/crm/automacoes/etapas');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Adicionar gatilho em/ }).first().click();
  const janela = page.getByRole('dialog');
  await janela.getByLabel('Quando movido para esta etapa').check();
  await janela.getByLabel(/^Mensagem/).fill('Oi {nome}, recebemos seu contato E2E');
  await janela.getByLabel('Só em algumas condições').check();
  await janela.getByRole('button', { name: 'Sáb' }).click();
  await janela.getByRole('button', { name: 'Dom' }).click();
  await janela.getByRole('button', { name: 'Criar gatilho' }).click();
  await expect(janela).toBeHidden();
  const cartao = page.getByRole('listitem').filter({ hasText: 'recebemos seu contato E2E' }).first();
  await expect(cartao).toContainText('Sáb - Dom');
  await expect(cartao).toContainText('Quando movido para esta etapa');
  // Apaga: os outros testes não contam com ele.
  await cartao.getByRole('button', { name: /^Apagar gatilho/ }).click();
  await expect(page.getByText('recebemos seu contato E2E')).toHaveCount(0);

  await page.goto('/crm/automacoes/bots');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Novo robô' }).click();
  await page.getByRole('link', { name: /Em branco/ }).click();
  await page.waitForURL(/\/crm\/automacoes\/bots\/novo/);
  const nome = uniqueName('Robô E2E');
  await page.getByLabel('Nome do robô').fill(nome);
  await page.getByRole('radio', { name: /Palavra-chave/ }).check();
  await page.getByLabel(/^Palavras-chave/).fill(`e2e${Date.now()}`);
  // O teste responde na hora, sem gravar nada.
  await page.getByRole('button', { name: 'Testar' }).click();
  await expect(page.getByRole('log', { name: 'Conversa de teste' })).toContainText('Oi, Ana! Como posso ajudar?');
  await expect(page.getByRole('log', { name: 'Conversa de teste' })).toContainText('Robô encerrado');
  // Desligado (padrão de robô novo): um robô ligado responderia nos outros testes.
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.waitForURL(/\/crm\/automacoes\/bots\/(?!novo)[^/]+$/);
  await page.getByRole('link', { name: 'Robôs' }).click();
  await expect(page.getByRole('link', { name: `Editar ${nome}` })).toBeVisible();

  // Limpa o que criou: o funil e as conversas dos outros testes não podem mudar.
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  await prisma.stageAutomation.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.chatbotFlow.deleteMany({ where: { tenantId: tenant.id, name: nome } });
});

test('captação: regra com palavra e tag nova, testada na hora', async ({ page }) => {
  const nome = uniqueName('Captação E2E');
  const tag = `cap${Date.now().toString(36)}`;
  await page.goto('/crm/automacoes/bots');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Nova regra' }).click();
  const form = page.getByRole('form', { name: 'Nova regra de captação' });
  await form.getByLabel('Nome da regra').fill(nome);
  await form.getByLabel(/^Palavras/).fill('Implante, dente fixo');
  await expect(form.getByText('Procura: “implante”, “dente fixo”')).toBeVisible();
  await form.getByLabel('Nome da nova tag').fill(tag);
  await form.getByRole('button', { name: 'Criar tag' }).click();
  await form.getByRole('button', { name: tag, exact: true }).click();
  await form.getByLabel('Origem do lead').selectOption('INSTAGRAM');
  await form.getByRole('button', { name: 'Salvar regra' }).click();
  await expect(page.getByText(`“implante”, “dente fixo” → tag ${tag} · origem Instagram`)).toBeVisible();

  await page.getByLabel('Testar uma primeira mensagem').fill('Oi, quero colocar IMPLANTES');
  await expect(page.getByText(`Achou “implante” → tag ${tag} · origem Instagram.`)).toBeVisible();

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG } });
  await prisma.captureRule.deleteMany({ where: { tenantId: tenant.id, name: nome } });
  await prisma.leadTag.deleteMany({ where: { tenantId: tenant.id, name: tag } });
});
