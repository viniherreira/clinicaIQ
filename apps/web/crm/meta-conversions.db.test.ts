import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('aviso de agendou/fechou à Meta (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { ingestChat } = await import('./chat-ingest');
  const { afterInbound } = await import('./inbound');
  const { moveLead } = await import('./leads');
  const { reportConversion } = await import('./meta-conversions');
  const { sealToken } = await import('@/lib/cloud-account');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `capi_${suffix}`, name: 'Conversões', slug: `capi-${suffix}`, settings: { crm: { autoTags: false } } },
  });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  const waba = `WABA_${suffix}`;
  await prisma.whatsAppCloudAccount.create({
    data: { tenantId: tenant.id, wabaId: waba, phoneNumberId: `PN_${suffix}`, accessTokenEncrypted: sealToken('TOKEN', tenant.id) },
  });
  const etapa = async (role: 'SCHEDULED' | 'WON') => (await db.pipelineStage.findFirst({ where: { role } }))!.id;

  let seq = 0;
  async function chega(phone: string, clid?: string) {
    const r = await ingestChat(tenant.id, {
      externalId: `CAPI${suffix}${seq++}`,
      direction: 'INBOUND',
      origin: 'CONTACT',
      phone,
      contactName: 'Ana',
      kind: 'TEXT',
      text: 'Oi, quero saber o preço',
      ad: clid
        ? { sourceId: '1', sourceType: 'ad', sourceUrl: 'https://fb.me/x', headline: 'Implante', body: null, mediaType: null, imageUrl: null, videoUrl: null, thumbnailUrl: null, ctwaClid: clid }
        : undefined,
      at: new Date(),
    });
    if (!r.recorded) throw new Error('não gravou');
    await afterInbound(tenant.id, r.conversationId, r.messageId, { skipBot: true });
    const c = await db.conversation.findFirst({ where: { id: r.conversationId }, select: { leadId: true } });
    return c!.leadId!;
  }

  const chamadas: { url: string; body: unknown }[] = [];
  function meta(respostas: object[]) {
    chamadas.length = 0;
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        const r = respostas[Math.min(i++, respostas.length - 1)];
        return new Response(JSON.stringify(r), { status: 'error' in r ? 400 : 200 });
      }),
    );
  }
  afterEach(() => vi.unstubAllGlobals());
  const avisos = (leadId: string) =>
    db.leadActivity.findMany({ where: { leadId, type: 'CLINIC_EVENT' }, select: { data: true } }).then((a) => a.map((x) => (x.data as { event: string }).event));

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.automationRun.deleteMany({ where: t });
    await prisma.stageAutomation.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.whatsAppCloudAccount.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('veio de anúncio e fechou: manda Purchase com o valor, uma vez só', async () => {
    const leadId = await chega('11 98888-1001', 'CLID-A');
    await db.lead.update({ where: { id: leadId }, data: { estimatedValueCents: 450000 } });
    meta([{ id: 'DS1' }, { events_received: 1 }]);
    await reportConversion(tenant.id, leadId, 'fechou');
    expect(chamadas.map((c) => c.url)).toEqual([
      expect.stringMatching(new RegExp(`/${waba}/dataset$`)),
      expect.stringMatching(/\/DS1\/events$/),
    ]);
    expect(chamadas[1]!.body).toMatchObject({
      data: [{ event_name: 'Purchase', user_data: { whatsapp_business_account_id: waba, ctwa_clid: 'CLID-A' }, custom_data: { currency: 'BRL', value: 4500 } }],
    });
    expect(await avisos(leadId)).toEqual(['meta.fechou']);

    // De novo: já foi, não chama a Meta.
    meta([{ events_received: 1 }]);
    await reportConversion(tenant.id, leadId, 'fechou');
    expect(chamadas).toHaveLength(0);
  });

  it('sem anúncio não manda nada', async () => {
    const leadId = await chega('11 98888-1002');
    meta([{ events_received: 1 }]);
    await reportConversion(tenant.id, leadId, 'agendou');
    expect(chamadas).toHaveLength(0);
    expect(await avisos(leadId)).toEqual([]);
  });

  it('Meta recusou (sem permissão): não marca como enviado, para tentar na próxima', async () => {
    const leadId = await chega('11 98888-1003', 'CLID-C');
    meta([{ error: { code: 200, message: 'Permissions error' } }]);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await reportConversion(tenant.id, leadId, 'agendou');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
    expect(await avisos(leadId)).toEqual([]);
  });

  it('mover para Agendados avisa sozinho (LeadSubmitted)', async () => {
    const leadId = await chega('11 98888-1004', 'CLID-D');
    meta([{ events_received: 1 }]);
    const r = await moveLead(db, { tenantId: tenant.id, userId: null }, leadId, { stageId: await etapa('SCHEDULED') });
    expect(r.ok).toBe(true);
    await vi.waitFor(async () => expect(await avisos(leadId)).toEqual(['meta.agendou']));
    expect(chamadas.at(-1)!.body).toMatchObject({ data: [{ event_name: 'LeadSubmitted' }] });
  });

  it('desligado nas configurações: não manda', async () => {
    const leadId = await chega('11 98888-1005', 'CLID-E');
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: { crm: { autoTags: false, metaEvents: false } } } });
    meta([{ events_received: 1 }]);
    await reportConversion(tenant.id, leadId, 'agendou');
    expect(chamadas).toHaveLength(0);
  });
});
