import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: () => undefined }));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';
process.env.META_APP_ID = 'APP';
process.env.META_APP_SECRET = 'SEGREDO';
process.env.META_ADS_CONFIG_ID = 'CONFIG';

describe.skipIf(!process.env.DATABASE_URL)('Gerenciador de Anúncios: conexão e relatório (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { ingestChat } = await import('./chat-ingest');
  const { afterInbound } = await import('./inbound');
  const { moveLead } = await import('./leads');
  const account = await import('./ads-account');
  const { adLeadEvents, loadAdsPage, liveFetchers } = await import('./ads-report');
  const { readAdsSettings } = await import('./ads-rules');
  const { reportRange } = await import('./report-period');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  // Tags e avisos à Meta desligados: este teste olha só os números.
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `ads_${suffix}`, name: 'Anúncios', slug: `ads-${suffix}`, settings: { crm: { autoTags: false, metaEvents: false } } },
  });
  const outra = await prisma.tenant.create({ data: { clerkOrgId: `ads2_${suffix}`, name: 'Outra', slug: `ads2-${suffix}` } });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  const etapa = async (role: 'SCHEDULED' | 'ATTENDED' | 'WON') => (await db.pipelineStage.findFirst({ where: { role } }))!.id;
  const robo = { tenantId: tenant.id, userId: null };

  let seq = 0;
  async function chega(phone: string, adId?: string) {
    const r = await ingestChat(tenant.id, {
      externalId: `ADS${suffix}${seq++}`,
      direction: 'INBOUND',
      origin: 'CONTACT',
      phone,
      contactName: 'Li',
      kind: 'TEXT',
      text: 'Oi',
      ad: adId
        ? { sourceId: adId, sourceType: 'ad', sourceUrl: 'https://fb.me/x', headline: 'Implante', body: null, mediaType: null, imageUrl: null, videoUrl: null, thumbnailUrl: null, ctwaClid: 'C' }
        : undefined,
      at: new Date(),
    });
    if (!r.recorded) throw new Error('não gravou');
    await afterInbound(tenant.id, r.conversationId, r.messageId, { skipBot: true });
    return (await db.conversation.findFirst({ where: { id: r.conversationId }, select: { leadId: true } }))!.leadId!;
  }

  /** A Meta de mentira: responde pelo caminho do endereço. */
  const pedidos: { path: string; auth: string | null; url: string }[] = [];
  function meta(respostas: Record<string, (u: URL) => { status?: number; body: unknown }>) {
    pedidos.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const u = new URL(String(input));
        const path = u.pathname.replace(/^\/v[\d.]+\//, '');
        pedidos.push({ path, auth: new Headers(init?.headers).get('authorization'), url: String(input) });
        const chave = Object.keys(respostas).find((k) => path === k || path.endsWith(k));
        const r = chave !== undefined ? respostas[chave](u) : { status: 404, body: { error: { code: 100 } } };
        return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
      }),
    );
  }
  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    for (const id of [tenant.id, outra.id]) {
      const t = { tenantId: id };
      await prisma.auditLog.deleteMany({ where: t });
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
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  const contas = [
    { name: 'Conta parada', account_id: '350015125661419', currency: 'BRL', amount_spent: '0' },
    { name: 'CA clínica', account_id: '3745555152329524', currency: 'BRL', amount_spent: '128615' },
  ];

  it('conectar: troca o código, guarda o token cifrado e pede para escolher a conta', async () => {
    meta({
      'oauth/access_token': () => ({ body: { access_token: 'TOKEN-SECRETO' } }),
      'me/adaccounts': () => ({ body: { data: contas } }),
    });
    const r = await account.startAdsConnection(tenant.id, null, { code: 'CODIGO' });
    expect(r).toMatchObject({ ok: true, chosen: null });
    if (!r.ok) throw new Error(r.message);
    expect(r.accounts.map((a) => [a.id, a.spentCents])).toEqual([
      ['350015125661419', 0],
      ['3745555152329524', 128615],
    ]);
    // O token vai no cabeçalho, nunca no endereço.
    const lista = pedidos.find((p) => p.path === 'me/adaccounts')!;
    expect(lista.auth).toBe('Bearer TOKEN-SECRETO');
    expect(lista.url).not.toContain('TOKEN-SECRETO');

    const t = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { settings: true } });
    const salvo = readAdsSettings(t?.settings)!;
    expect(salvo.accountId).toBeNull();
    expect(JSON.stringify(t?.settings)).not.toContain('TOKEN-SECRETO');
    // As outras configurações continuam lá.
    expect((t?.settings as { crm: { autoTags: boolean } }).crm.autoTags).toBe(false);
    expect(await account.adsConnection(tenant.id)).toMatchObject({ state: 'choosing' });
    expect(await account.adsCredentials(tenant.id)).toBeNull();
  });

  it('token de sistema que não lista direto: acha a conta pela empresa', async () => {
    const { listAdAccounts } = await import('./ads-meta');
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    meta({
      'me/adaccounts': () => ({ body: { data: [] } }),
      'me/assigned_ad_accounts': () => ({ status: 400, body: { error: { code: 100 } } }),
      debug_token: () => ({ body: { data: { granular_scopes: [{ scope: 'ads_read' }, { scope: 'business_management', target_ids: ['777777777'] }] } } }),
      me: () => ({ body: { id: '1' } }),
      '777777777/owned_ad_accounts': () => ({ body: { data: [contas[1]] } }),
      '777777777/client_ad_accounts': () => ({ body: { data: [] } }),
    });
    const achadas = await listAdAccounts('TOKEN-SECRETO', { id: 'APP', secret: 'SEGREDO' });
    expect(achadas.map((a) => a.id)).toEqual(['3745555152329524']);
    // O registro diz o que cada caminho achou, sem o token.
    expect(JSON.stringify(log.mock.calls)).not.toContain('TOKEN-SECRETO');
    expect(log.mock.calls[0][1]).toMatchObject({ 'me/adaccounts': 0, 'empresa/owned_ad_accounts': 1 });
    log.mockRestore();
  });

  it('token de pessoa direto da janela: confere com a Meta antes de usar', async () => {
    const outro = await prisma.tenant.create({ data: { clerkOrgId: `adsT_${suffix}`, name: 'Token', slug: `adst-${suffix}` } });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Token de outro app: recusa e não grava nada.
      meta({ debug_token: () => ({ body: { data: { is_valid: true, app_id: 'OUTRO' } } }) });
      expect(await account.startAdsConnection(outro.id, null, { accessToken: 'TOKEN-DE-FORA' })).toMatchObject({ ok: false });
      expect(await account.adsConnection(outro.id)).toMatchObject({ state: 'none' });

      meta({
        debug_token: () => ({ body: { data: { is_valid: true, app_id: 'APP', scopes: ['ads_read'] } } }),
        'oauth/access_token': () => ({ body: { access_token: 'TOKEN-60-DIAS' } }),
        'me/adaccounts': () => ({ body: { data: [contas[1]] } }),
      });
      const r = await account.startAdsConnection(outro.id, null, { accessToken: 'TOKEN-CURTO' });
      expect(r).toMatchObject({ ok: true, chosen: { id: '3745555152329524' } });
      // Guardou o de 60 dias, não o curto.
      expect(await account.adsCredentials(outro.id)).toEqual({ token: 'TOKEN-60-DIAS', accountId: '3745555152329524' });
    } finally {
      info.mockRestore();
      erro.mockRestore();
      await prisma.auditLog.deleteMany({ where: { tenantId: outro.id } });
      await prisma.tenant.delete({ where: { id: outro.id } });
    }
  });

  it('escolher a conta: confere com a Meta antes de gravar', async () => {
    meta({ act_999999: () => ({ status: 400, body: { error: { code: 200 } } }) });
    expect(await account.chooseAdAccount(tenant.id, null, '999999')).toMatchObject({ ok: false });
    expect(await account.chooseAdAccount(tenant.id, null, 'abc')).toMatchObject({ ok: false, message: 'Conta de anúncios inválida.' });

    meta({ act_3745555152329524: () => ({ body: contas[1] }) });
    expect(await account.chooseAdAccount(tenant.id, null, '3745555152329524')).toEqual({ ok: true });
    expect(await account.adsConnection(tenant.id)).toMatchObject({ state: 'connected', accountId: '3745555152329524', accountName: 'CA clínica' });
    expect(await account.adsCredentials(tenant.id)).toEqual({ token: 'TOKEN-SECRETO', accountId: '3745555152329524' });
    // Outra clínica não enxerga nada.
    expect(await account.adsConnection(outra.id)).toMatchObject({ state: 'none' });
    expect(await account.adsCredentials(outra.id)).toBeNull();
  });

  it('o CRM conta agendou, compareceu e fechou só de quem veio de anúncio', async () => {
    const a = await chega('11 97777-0001', '120200000000001');
    const b = await chega('11 97777-0002', '120200000000001');
    const semAnuncio = await chega('11 97777-0003');
    await db.lead.update({ where: { id: a }, data: { estimatedValueCents: 450000 } });
    for (const id of [a, b, semAnuncio]) await moveLead(db, robo, id, { stageId: await etapa('SCHEDULED') });
    await moveLead(db, robo, a, { stageId: await etapa('ATTENDED') });
    await moveLead(db, robo, a, { stageId: await etapa('WON') });
    await moveLead(db, robo, semAnuncio, { stageId: await etapa('WON') });

    const { current, previous } = reportRange('7d');
    const rows = await adLeadEvents(tenant.id, current);
    const soma = (kind: string) => rows.filter((r) => r.kind === kind).reduce((s, r) => s + r.n, 0);
    expect(rows.every((r) => r.adId === '120200000000001')).toBe(true);
    expect([soma('lead'), soma('scheduled'), soma('attended'), soma('won')]).toEqual([2, 2, 1, 1]);
    expect(rows.find((r) => r.kind === 'won')?.cents).toBe(450000);
    // Fora do período, e em outra clínica: nada.
    expect(await adLeadEvents(tenant.id, previous)).toEqual([]);
    expect(await adLeadEvents(outra.id, current)).toEqual([]);
  });

  it('a tela junta Meta e CRM: custo por agendamento, por paciente e retorno', async () => {
    const hoje = reportRange('7d').current.until;
    const linha = { campaign_id: '900', campaign_name: 'Implante', spend: '300.00', inline_link_clicks: '40', impressions: '5000', reach: '2000', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '10' }] };
    meta({
      insights: (u) => {
        const nivel = u.searchParams.get('level');
        const recorte = u.searchParams.get('breakdowns');
        const conversas = (n: string) => ({ spend: '100.00', impressions: '900', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: n }] });
        if (recorte === 'publisher_platform') return { body: { data: [{ publisher_platform: 'instagram', ...conversas('7') }, { publisher_platform: 'facebook', ...conversas('3') }] } };
        if (recorte === 'age,gender') return { body: { data: [{ age: '35-44', gender: 'female', ...conversas('6') }, { age: '25-34', gender: 'male', ...conversas('4') }] } };
        // A Meta nega o recorte por hora: a tela segue sem aquele gráfico.
        if (recorte) return { status: 400, body: { error: { code: 100, message: 'breakdown não permitido' } } };
        if (u.searchParams.get('time_increment')) return { body: { data: [{ ...linha, date_start: hoje, date_stop: hoje }] } };
        if (nivel === 'ad') return { body: { data: [{ ...linha, ad_id: '120200000000001', ad_name: 'Vídeo implante' }] } };
        return { body: { data: [linha] } };
      },
      '': () => ({ body: { '120200000000001': { name: 'Vídeo implante', campaign: { id: '900', name: 'Implante' }, creative: { thumbnail_url: 'https://scontent.xx/t.jpg' } } } }),
    });
    const r = await loadAdsPage(tenant.id, '7d', null, { fetchers: liveFetchers });
    if (r.state !== 'ok') throw new Error(`estado ${r.state}`);
    expect(r.report.totals).toEqual({ spendCents: 30000, conversations: 10, scheduled: 2, attended: 1, won: 1, revenueCents: 450000 });
    expect(r.report.kpis.costPerConversation.value).toBe(3000);
    expect(r.report.kpis.costPerScheduled.value).toBe(15000);
    expect(r.report.kpis.costPerPatient.value).toBe(30000);
    expect(r.report.kpis.roas.value).toBe(15);
    expect(r.report.funnel.map((f) => f.value)).toEqual([2000, 40, 10, 2, 1, 1]);
    expect(r.report.lines[0]).toMatchObject({ name: 'Implante', status: 'good' });
    expect(r.report.lines[0].ads[0]).toMatchObject({ name: 'Vídeo implante', thumbnailUrl: 'https://scontent.xx/t.jpg', won: 1 });
    expect(r.report.delivery).toMatchObject({ impressions: 5000, reach: 2000, cpmCents: 6000, ticketCents: 450000 });
    // Os recortes: lugar, idade e gênero; o de hora falhou e ficou vazio.
    expect(r.breakdowns.platforms.lines.map((l) => [l.label, l.value])).toEqual([['Instagram', 7], ['Facebook', 3]]);
    expect(r.breakdowns.audience.top).toEqual({ age: '35-44', gender: 'female', value: 6 });
    expect(r.breakdowns.audience.totals).toEqual({ female: 6, male: 4, unknown: 0 });
    expect(r.breakdowns.hours.peak).toBeNull();
    // Nenhum pedido levou o token no endereço.
    expect(pedidos.every((p) => !p.url.includes('TOKEN-SECRETO'))).toBe(true);
  });

  it('a Meta pede pausa ou o token expira: a tela recebe a frase certa', async () => {
    meta({ insights: () => ({ status: 400, body: { error: { code: 17, message: 'User request limit reached' } } }) });
    expect(await loadAdsPage(tenant.id, '7d', null, { fetchers: liveFetchers })).toMatchObject({ state: 'error', kind: 'rate', message: expect.stringMatching(/pausa/) });
    meta({ insights: () => ({ status: 400, body: { error: { code: 190 } } }) });
    expect(await loadAdsPage(tenant.id, '7d', null, { fetchers: liveFetchers })).toMatchObject({ state: 'error', kind: 'auth' });
  });

  it('desconectar apaga o token e a conta, e registra', async () => {
    expect(await account.disconnectAds(tenant.id, null)).toEqual({ ok: true });
    const t = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { settings: true } });
    expect((t?.settings as Record<string, unknown>).ads).toBeUndefined();
    expect(await loadAdsPage(tenant.id, '7d', null, { fetchers: liveFetchers })).toMatchObject({ state: 'not_connected' });
    const acoes = (await prisma.auditLog.findMany({ where: { tenantId: tenant.id, entity: 'AdsAccount' }, select: { action: true } })).map((a) => a.action);
    expect(acoes.sort()).toEqual(['ADS_ACCOUNT_CHOSEN', 'ADS_CONNECTED', 'ADS_DISCONNECTED']);
  });
});
