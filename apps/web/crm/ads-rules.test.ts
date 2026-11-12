import { describe, expect, it } from 'vitest';
import {
  accountNumber,
  ageLabel,
  buildAdHours,
  buildAdsReport,
  buildAudience,
  buildPlatforms,
  change,
  changeTone,
  classifyMetaError,
  conversationsOf,
  costPer,
  formatChange,
  formatMoney,
  formatRate,
  formatRoas,
  moneyToCents,
  parseBreakdown,
  parseInsight,
  readAdsSettings,
  roasOf,
  roasStatus,
  type AdInfo,
  type BreakdownRow,
  type CrmEventRow,
  type InsightRow,
} from './ads-rules';
import { daysOf } from './report-period';

describe('ler o que a Meta devolve', () => {
  it('a resposta real da conta: gasto em texto, conversas dentro de actions', () => {
    const r = parseInsight({
      spend: '1286.61',
      impressions: '39442',
      clicks: '564',
      inline_link_clicks: '311',
      reach: '17458',
      date_start: '2026-10-01',
      date_stop: '2026-11-11',
      actions: [
        { action_type: 'onsite_conversion.lead', value: '23' },
        { action_type: 'link_click', value: '311' },
        { action_type: 'onsite_conversion.total_messaging_connection', value: '142' },
      ],
    });
    expect(r).toMatchObject({ spendCents: 128661, impressions: 39442, reach: 17458, clicks: 311, conversations: 142, day: null });
  });

  it('prefere "conversa iniciada"; sem ela, usa a conexão por mensagem', () => {
    expect(
      conversationsOf([
        { action_type: 'onsite_conversion.total_messaging_connection', value: '142' },
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '97' },
      ]),
    ).toBe(97);
    expect(conversationsOf([{ action_type: 'post_reaction', value: '94' }])).toBe(0);
    expect(conversationsOf(undefined)).toBe(0);
  });

  it('linha por dia traz o dia; campos faltando viram zero, nunca NaN', () => {
    const r = parseInsight({ date_start: '2026-11-10', date_stop: '2026-11-10', campaign_id: '1', campaign_name: 'Implante', spend: 'abc' });
    expect(r).toMatchObject({ day: '2026-11-10', campaignId: '1', campaignName: 'Implante', spendCents: 0, clicks: 0, conversations: 0 });
    expect(parseInsight(null).spendCents).toBe(0);
    expect(moneyToCents('9.065')).toBe(907);
    expect(moneyToCents(-3)).toBe(0);
  });

  it('erros da Meta viram frases simples', () => {
    expect(classifyMetaError(400, { error: { code: 17 } })).toMatchObject({ kind: 'rate', message: expect.stringMatching(/pausa/) });
    expect(classifyMetaError(400, { error: { code: 80004 } }).kind).toBe('rate');
    expect(classifyMetaError(400, { error: { code: 190 } })).toMatchObject({ kind: 'auth', message: expect.stringMatching(/Conecte de novo/) });
    expect(classifyMetaError(400, { error: { code: 200 } }).kind).toBe('permission');
    expect(classifyMetaError(500, {}).kind).toBe('other');
    // A frase nunca repete o texto cru da Meta (pode trazer ids e tokens).
    expect(classifyMetaError(400, { error: { code: 100, message: 'Invalid OAuth access token EAAB123' } }).message).not.toMatch(/EAAB/);
  });

  it('a conexão guardada: sem token não há conexão; conta inválida fica "a escolher"', () => {
    expect(readAdsSettings(null)).toBeNull();
    expect(readAdsSettings({ ads: { accountId: '123456' } })).toBeNull();
    expect(readAdsSettings({ ads: { tokenEncrypted: 'x', accountId: 'act_1' } })?.accountId).toBeNull();
    expect(readAdsSettings({ ads: { tokenEncrypted: 'x', accountId: '3745555152329524', accountName: 'CA' } })).toMatchObject({
      accountId: '3745555152329524',
      accountName: 'CA',
    });
    expect(accountNumber('act_3745555152329524')).toBe('3745555152329524');
    expect(accountNumber('act_abc')).toBeNull();
  });
});

describe('as contas', () => {
  it('custo por unidade e retorno; sem divisor não há número', () => {
    expect(costPer(128661, 142)).toBe(906);
    expect(costPer(128661, 0)).toBeNull();
    expect(roasOf(1820000, 128661)).toBeCloseTo(14.15, 2);
    expect(roasOf(1000, 0)).toBeNull();
  });

  it('variação contra o período anterior; em custo, cair é bom', () => {
    expect(change(120, 100)).toBeCloseTo(0.2);
    expect(change(80, 100)).toBeCloseTo(-0.2);
    expect(change(80, 0)).toBeNull();
    expect(change(null, 100)).toBeNull();
    expect(changeTone(-0.2, true)).toBe('good');
    expect(changeTone(0.2, true)).toBe('bad');
    expect(changeTone(0.2, false)).toBe('good');
    expect(changeTone(0.001, false)).toBe('neutral');
    expect(changeTone(null, true)).toBe('neutral');
  });

  it('a cor do retorno: verde a partir de 3x, âmbar de 1x a 3x, vermelho abaixo ou sem fechamento', () => {
    expect(roasStatus(3, 1000, 1)).toBe('good');
    expect(roasStatus(2.9, 1000, 1)).toBe('warn');
    expect(roasStatus(0.8, 1000, 1)).toBe('bad');
    expect(roasStatus(null, 1000, 0)).toBe('bad');
    expect(roasStatus(null, 0, 0)).toBe('none');
  });

  it('formatos', () => {
    expect(formatMoney(906).replace(/\s/g, ' ')).toBe('R$ 9,06');
    expect(formatRoas(14.15)).toBe('14,2x');
    expect(formatRate(0.268)).toBe('27%');
    expect(formatRate(0.032)).toBe('3,2%');
    expect(formatRate(0)).toBe('0%');
    expect(formatChange(0.123)).toBe('+12%');
    expect(formatChange(-0.08)).toBe('−8%');
    expect(formatChange(25)).toBe('+999%');
  });
});

describe('o relatório (Meta + CRM)', () => {
  const dias = daysOf({ since: '2026-11-01', until: '2026-11-10' });
  const meta = (day: string, campaignId: string, spendCents: number, conversations: number, clicks = 0): InsightRow => ({
    day,
    campaignId,
    campaignName: campaignId === 'c1' ? 'Implante' : 'Clareamento',
    adId: null,
    adName: null,
    spendCents,
    impressions: 0,
    reach: 0,
    clicks,
    conversations,
  });
  const ad = (adId: string, campaignId: string, spendCents: number, conversations: number): InsightRow => ({
    ...meta('', campaignId, spendCents, conversations),
    day: null,
    adId,
    adName: `Anúncio ${adId}`,
  });
  const crm = (adId: string | null, kind: CrmEventRow['kind'], day: string, n: number, cents = 0): CrmEventRow => ({ adId, kind, day, n, cents });
  const info = new Map<string, AdInfo>([
    ['a1', { name: 'Anúncio a1', campaignId: 'c1', campaignName: 'Implante', thumbnailUrl: 'https://img/a1.jpg' }],
    ['a2', { name: 'Anúncio a2', campaignId: 'c2', campaignName: 'Clareamento', thumbnailUrl: null }],
    ['velho', { name: 'Anúncio antigo', campaignId: 'c1', campaignName: 'Implante', thumbnailUrl: null }],
  ]);

  const base = {
    days: dias,
    campaignDaily: [
      // Período anterior (22 a 31/10).
      meta('2026-10-25', 'c1', 40000, 20),
      // Atual.
      meta('2026-11-02', 'c1', 30000, 30, 100),
      meta('2026-11-08', 'c1', 30000, 30, 80),
      meta('2026-11-05', 'c2', 20000, 40, 60),
    ],
    adTotals: [ad('a1', 'c1', 60000, 60), ad('a2', 'c2', 20000, 40)],
    accountReach: 9000,
    campaignReach: new Map([
      ['c1', 6000],
      ['c2', 4000],
    ]),
    adInfo: info,
    crmCurrent: [
      crm('a1', 'lead', '2026-11-02', 12),
      crm('a1', 'scheduled', '2026-11-03', 6),
      crm('a1', 'attended', '2026-11-06', 4),
      crm('a1', 'won', '2026-11-08', 2, 900000),
      crm('a2', 'scheduled', '2026-11-06', 2),
      // Clicou num anúncio antigo (sem entrega agora) e fechou neste período.
      crm('velho', 'won', '2026-11-09', 1, 300000),
      // Anúncio de outra conta: a conta conectada não conhece.
      crm('fora', 'scheduled', '2026-11-04', 3),
    ],
    crmPrevious: [crm('a1', 'scheduled', '2026-10-26', 2), crm('a1', 'won', '2026-10-28', 1, 200000)],
    campaignId: null,
  };

  it('todas as campanhas: os cinco números, com a variação', () => {
    const r = buildAdsReport(base);
    expect(r.totals).toEqual({ spendCents: 80000, conversations: 100, scheduled: 8, attended: 4, won: 3, revenueCents: 1200000 });
    expect(r.kpis.spend).toMatchObject({ value: 80000, previous: 40000, change: 1, tone: 'neutral' });
    // R$ 800 ÷ 100 conversas = R$ 8,00; antes R$ 400 ÷ 20 = R$ 20,00: caiu, é bom.
    expect(r.kpis.costPerConversation).toMatchObject({ value: 800, previous: 2000, tone: 'good' });
    expect(r.kpis.costPerScheduled).toMatchObject({ value: 10000, previous: 20000, tone: 'good' });
    expect(r.kpis.costPerPatient.value).toBe(26667);
    expect(r.kpis.roas.value).toBeCloseTo(15);
    expect(r.kpis.roas.previous).toBeCloseTo(5);
    expect(r.kpis.roas.tone).toBe('good');
    expect(r.empty).toBe(false);
  });

  it('o funil: três etapas da Meta, três do CRM, cada uma sobre a anterior', () => {
    const f = buildAdsReport(base).funnel;
    expect(f.map((e) => [e.key, e.value, e.source])).toEqual([
      ['reach', 9000, 'meta'],
      ['clicks', 240, 'meta'],
      ['conversations', 100, 'meta'],
      ['scheduled', 8, 'crm'],
      ['attended', 4, 'crm'],
      ['won', 3, 'crm'],
    ]);
    expect(f[0].ofPrevious).toBeNull();
    expect(f[3].ofPrevious).toBeCloseTo(0.08);
    expect(f[5].ofPrevious).toBeCloseTo(0.75);
  });

  it('a tabela: campanha com os anúncios dentro, o anúncio antigo incluído', () => {
    const r = buildAdsReport(base);
    expect(r.lines.map((l) => l.name)).toEqual(['Implante', 'Clareamento']);
    const implante = r.lines[0];
    expect(implante).toMatchObject({ spendCents: 60000, conversations: 60, scheduled: 6, won: 3, revenueCents: 1200000, status: 'good' });
    expect(implante.ads.map((a) => [a.id, a.spendCents, a.won])).toEqual([
      ['a1', 60000, 2],
      ['velho', 0, 1],
    ]);
    expect(implante.ads[0].thumbnailUrl).toBe('https://img/a1.jpg');
    // Gastou e ninguém fechou: vermelho.
    expect(r.lines[1]).toMatchObject({ won: 0, roas: 0, status: 'bad' });
    expect(r.unmatched).toMatchObject({ scheduled: 3 });
  });

  it('filtro de campanha: só ela, com o alcance dela', () => {
    const r = buildAdsReport({ ...base, campaignId: 'c2' });
    expect(r.campaignId).toBe('c2');
    expect(r.totals).toMatchObject({ spendCents: 20000, conversations: 40, scheduled: 2, won: 0 });
    expect(r.funnel[0].value).toBe(4000);
    expect(r.lines.map((l) => l.id)).toEqual(['c2']);
    expect(r.campaigns.map((c) => c.id)).toEqual(['c2', 'c1']);
    // Campanha que não existe no período: ignora o filtro.
    expect(buildAdsReport({ ...base, campaignId: 'zzz' }).campaignId).toBeNull();
  });

  it('por dia: um ponto por dia até caber; agendamentos vêm do CRM', () => {
    const r = buildAdsReport(base);
    expect(r.daily).toHaveLength(10);
    expect(r.daily[1]).toMatchObject({ label: '02/11', spendCents: 30000, conversations: 30, scheduled: 0 });
    expect(r.daily[2].scheduled).toBe(6);
    const semanas = buildAdsReport({ ...base, maxBars: 2 });
    expect(semanas.daily.map((d) => d.label)).toEqual(['01/11 a 05/11', '06/11 a 10/11']);
    expect(semanas.daily[0].spendCents).toBe(50000);
  });

  it('minilinha: trechos sem divisor ficam vazios, e um dia só não tem linha', () => {
    const r = buildAdsReport({ ...base, trendPoints: 5 });
    expect(r.kpis.spend.trend).toEqual([30000, 0, 20000, 30000, 0]);
    expect(r.kpis.costPerConversation.trend).toEqual([1000, null, 500, 1000, null]);
    expect(buildAdsReport({ ...base, days: ['2026-11-02'] }).kpis.spend.trend).toEqual([]);
  });

  it('entrega: exibições, alcance, frequência, custo por mil, taxa de clique e ticket médio', () => {
    const comExibicoes = base.campaignDaily.map((l) => ({ ...l, impressions: l.day! >= '2026-11-01' ? 6000 : 1000 }));
    const d = buildAdsReport({ ...base, campaignDaily: comExibicoes }).delivery;
    expect(d.impressions).toBe(18000);
    expect(d.reach).toBe(9000);
    expect(d.clicks).toBe(240);
    expect(d.frequency).toBeCloseTo(2);
    // R$ 800 por 18 mil exibições = R$ 44,44 a cada mil.
    expect(d.cpmCents).toBe(4444);
    expect(d.ctr).toBeCloseTo(240 / 18000);
    // R$ 12.000 em 3 fechamentos.
    expect(d.ticketCents).toBe(400000);
  });

  it('sem nada no período: vazio, sem dividir por zero', () => {
    const r = buildAdsReport({ ...base, campaignDaily: [], adTotals: [], accountReach: 0, crmCurrent: [], crmPrevious: [] });
    expect(r.empty).toBe(true);
    expect(r.delivery).toMatchObject({ ctr: null, cpmCents: null, frequency: null, ticketCents: null });
    expect(r.kpis.costPerConversation.value).toBeNull();
    expect(r.kpis.roas.value).toBeNull();
    expect(r.lines).toEqual([]);
  });
});

describe('recortes: onde, para quem e a que horas', () => {
  const linha = (keys: Record<string, string>, n: Partial<Omit<BreakdownRow, 'keys'>> = {}): BreakdownRow => ({
    keys,
    spendCents: 0,
    impressions: 0,
    clicks: 0,
    conversations: 0,
    ...n,
  });

  it('lê a linha da Meta com as chaves do recorte; chave faltando vira "unknown"', () => {
    const r = parseBreakdown(
      { age: '35-44', spend: '12.50', impressions: '300', clicks: '9', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '4' }] },
      ['age', 'gender'],
    );
    expect(r).toEqual({ keys: { age: '35-44', gender: 'unknown' }, spendCents: 1250, impressions: 300, clicks: 9, conversations: 4 });
    expect(parseBreakdown(null, ['age']).keys).toEqual({ age: 'unknown' });
  });

  it('lugares: soma por plataforma, ordena pelo resultado e calcula a fatia e o custo', () => {
    const p = buildPlatforms([
      linha({ publisher_platform: 'facebook' }, { spendCents: 20000, conversations: 10 }),
      linha({ publisher_platform: 'instagram' }, { spendCents: 30000, conversations: 20 }),
      linha({ publisher_platform: 'instagram' }, { spendCents: 30000, conversations: 10 }),
      linha({ publisher_platform: 'messenger' }),
    ]);
    expect(p.metric).toBe('conversations');
    expect(p.lines.map((l) => l.label)).toEqual(['Instagram', 'Facebook']);
    expect(p.lines[0]).toMatchObject({ value: 30, spendCents: 60000, costPerCents: 2000, share: 0.75 });
  });

  it('sem conversas, mostra cliques; sem cliques, exibições', () => {
    expect(buildPlatforms([linha({ publisher_platform: 'facebook' }, { clicks: 5, impressions: 90 })]).metric).toBe('clicks');
    expect(buildPlatforms([linha({ publisher_platform: 'facebook' }, { impressions: 90 })]).metric).toBe('impressions');
    expect(buildPlatforms([])).toEqual({ metric: 'impressions', lines: [] });
  });

  it('público: faixas em ordem de idade, totais por gênero e quem mais respondeu', () => {
    const a = buildAudience([
      linha({ age: '45-54', gender: 'male' }, { conversations: 3 }),
      linha({ age: '25-34', gender: 'female' }, { conversations: 8 }),
      linha({ age: '35-44', gender: 'female' }, { conversations: 14 }),
      linha({ age: '35-44', gender: 'male' }, { conversations: 5 }),
      linha({ age: '35-44', gender: 'unknown' }, { conversations: 1 }),
      linha({ age: '65+', gender: 'female' }),
    ]);
    expect(a.ages.map((x) => x.age)).toEqual(['25-34', '35-44', '45-54']);
    expect(a.ages[1]).toEqual({ age: '35-44', female: 14, male: 5, unknown: 1 });
    expect(a.totals).toEqual({ female: 22, male: 8, unknown: 1 });
    expect(a.top).toEqual({ age: '35-44', gender: 'female', value: 14 });
    expect(buildAudience([]).top).toBeNull();
  });

  it('idade por extenso', () => {
    expect(ageLabel('35-44')).toBe('35 a 44');
    expect(ageLabel('65+')).toBe('65 ou mais');
  });

  it('horas: 24 posições no horário da conta, com o pico', () => {
    const h = buildAdHours([
      linha({ hourly_stats_aggregated_by_advertiser_time_zone: '09:00:00 - 09:59:59' }, { conversations: 4 }),
      linha({ hourly_stats_aggregated_by_advertiser_time_zone: '19:00:00 - 19:59:59' }, { conversations: 11 }),
      linha({ hourly_stats_aggregated_by_advertiser_time_zone: '19:00:00 - 19:59:59' }, { conversations: 2 }),
      linha({ hourly_stats_aggregated_by_advertiser_time_zone: 'lixo' }, { conversations: 50 }),
    ]);
    expect(h.hours).toHaveLength(24);
    expect(h.hours[9]).toBe(4);
    expect(h.hours[19]).toBe(13);
    expect(h.peak).toBe(19);
    expect(buildAdHours([]).peak).toBeNull();
  });
});
