import { bucketDays, sumByBucket, type Bucket } from './report-period';

/**
 * Regras puras da tela Anúncios: ler o que a Meta devolve, fazer as contas
 * (custo por conversa, por agendamento, por paciente, retorno) e montar o
 * relatório juntando Meta e CRM. Sem banco e sem rede: testado por tabela em
 * `ads-rules.test.ts`. Quem busca os dados é `crm/ads-report.ts`.
 */

// ─── A conexão guardada em Tenant.settings.ads ───────────────────────────────

export interface AdsSettings {
  /** Token da Meta, cifrado com a chave da clínica (`sealToken`). Nunca sai do servidor. */
  tokenEncrypted: string;
  /** Conta de anúncios escolhida (só números, sem "act_"). Nulo = falta escolher. */
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  connectedAt: string;
  connectedById: string | null;
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Lê `Tenant.settings.ads` sem confiar na forma. */
export function readAdsSettings(settings: unknown): AdsSettings | null {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).ads : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const tokenEncrypted = texto(o.tokenEncrypted);
  if (!tokenEncrypted) return null;
  const accountId = texto(o.accountId);
  return {
    tokenEncrypted,
    accountId: accountId && /^\d{5,25}$/.test(accountId) ? accountId : null,
    accountName: texto(o.accountName),
    currency: texto(o.currency),
    connectedAt: texto(o.connectedAt) ?? new Date(0).toISOString(),
    connectedById: texto(o.connectedById),
  };
}

/** O id da conta como a Meta devolve ("act_123" ou "123") → só os números. */
export function accountNumber(id: unknown): string | null {
  const s = texto(id)?.replace(/^act_/, '') ?? null;
  return s && /^\d{5,25}$/.test(s) ? s : null;
}

// ─── Erros da Meta, em palavras da clínica ───────────────────────────────────

export type MetaErrorKind = 'rate' | 'auth' | 'permission' | 'other';

const RATE = new Set([4, 17, 32, 341, 613, 80000, 80004]);
const AUTH = new Set([102, 190]);
const PERMISSION = new Set([10, 200, 294, 2500]);

export function classifyMetaError(status: number, body: unknown): { kind: MetaErrorKind; message: string } {
  const code = (body as { error?: { code?: number } } | null)?.error?.code;
  if (code !== undefined && RATE.has(code)) return { kind: 'rate', message: 'A Meta pediu uma pausa. Tente de novo em alguns minutos.' };
  if (status === 429) return { kind: 'rate', message: 'A Meta pediu uma pausa. Tente de novo em alguns minutos.' };
  if ((code !== undefined && AUTH.has(code)) || status === 401) {
    return { kind: 'auth', message: 'A conexão com o Gerenciador de Anúncios expirou. Conecte de novo.' };
  }
  if ((code !== undefined && PERMISSION.has(code)) || status === 403) {
    return { kind: 'permission', message: 'A Meta não deixou ler esta conta de anúncios. Conecte de novo e marque a conta certa.' };
  }
  if (status >= 500) return { kind: 'other', message: 'A Meta está instável agora. Tente de novo em instantes.' };
  return { kind: 'other', message: 'Não foi possível ler os anúncios na Meta agora.' };
}

// ─── O que a Meta devolve ────────────────────────────────────────────────────

export interface InsightRow {
  /** "AAAA-MM-DD" quando o pedido é por dia; senão nulo. */
  day: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adId: string | null;
  adName: string | null;
  spendCents: number;
  impressions: number;
  reach: number;
  /** Cliques no link do anúncio (o que leva a pessoa para a conversa). */
  clicks: number;
  /** Conversas iniciadas no WhatsApp pelo anúncio. */
  conversations: number;
}

const inteiro = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** "1286.61" → 128661. A Meta manda dinheiro como texto, na moeda da conta. */
export function moneyToCents(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** As ações que contam como "conversa iniciada", da preferida para a reserva. */
const CONVERSATION_ACTIONS = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
];

/** Conversas iniciadas, lidas da lista `actions`. */
export function conversationsOf(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  for (const tipo of CONVERSATION_ACTIONS) {
    const a = actions.find((x) => x && typeof x === 'object' && (x as { action_type?: unknown }).action_type === tipo);
    if (a) return inteiro((a as { value?: unknown }).value);
  }
  return 0;
}

/** Uma linha de `/insights` → os números que a tela usa. */
export function parseInsight(raw: unknown): InsightRow {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dia = texto(r.date_start);
  return {
    day: dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia === texto(r.date_stop) ? dia : null,
    campaignId: texto(r.campaign_id),
    campaignName: texto(r.campaign_name),
    adId: texto(r.ad_id),
    adName: texto(r.ad_name),
    spendCents: moneyToCents(r.spend),
    impressions: inteiro(r.impressions),
    reach: inteiro(r.reach),
    clicks: r.inline_link_clicks !== undefined ? inteiro(r.inline_link_clicks) : inteiro(r.clicks),
    conversations: conversationsOf(r.actions),
  };
}

// ─── Recortes: onde, para quem e a que horas o anúncio apareceu ─────────────

/** Uma linha de `/insights` com `breakdowns`: as chaves do recorte e os números. */
export interface BreakdownRow {
  keys: Record<string, string>;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversations: number;
}

export function parseBreakdown(raw: unknown, fields: readonly string[]): BreakdownRow {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = parseInsight(raw);
  const keys: Record<string, string> = {};
  for (const f of fields) keys[f] = texto(r[f]) ?? 'unknown';
  return { keys, spendCents: base.spendCents, impressions: base.impressions, clicks: base.clicks, conversations: base.conversations };
}

/** Qual número o recorte mostra: conversas; sem conversas, cliques; sem cliques, vezes que apareceu. */
export type BreakdownMetric = 'conversations' | 'clicks' | 'impressions';

export const BREAKDOWN_METRIC_LABEL: Record<BreakdownMetric, string> = {
  conversations: 'conversas',
  clicks: 'cliques',
  impressions: 'exibições',
};

function pickMetric(rows: readonly BreakdownRow[]): BreakdownMetric {
  if (rows.some((r) => r.conversations > 0)) return 'conversations';
  return rows.some((r) => r.clicks > 0) ? 'clicks' : 'impressions';
}

const PLATFORM: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  messenger: 'Messenger',
  audience_network: 'Audience Network',
  threads: 'Threads',
  whatsapp: 'WhatsApp',
};

export interface PlatformLine {
  key: string;
  label: string;
  spendCents: number;
  value: number;
  costPerCents: number | null;
  /** Parte do total do número mostrado (0 a 1). */
  share: number;
}

/** Facebook, Instagram…: onde o anúncio apareceu e quanto rendeu em cada lugar. */
export function buildPlatforms(rows: readonly BreakdownRow[]): { metric: BreakdownMetric; lines: PlatformLine[] } {
  const metric = pickMetric(rows);
  const soma = new Map<string, { spendCents: number; value: number }>();
  for (const r of rows) {
    const k = r.keys.publisher_platform ?? 'unknown';
    const a = soma.get(k) ?? { spendCents: 0, value: 0 };
    soma.set(k, { spendCents: a.spendCents + r.spendCents, value: a.value + r[metric] });
  }
  const total = [...soma.values()].reduce((s, v) => s + v.value, 0);
  const lines = [...soma.entries()]
    .filter(([, v]) => v.value > 0 || v.spendCents > 0)
    .map(([key, v]): PlatformLine => ({
      key,
      label: PLATFORM[key] ?? (key === 'unknown' ? 'Outros' : key),
      spendCents: v.spendCents,
      value: v.value,
      costPerCents: costPer(v.spendCents, v.value),
      share: total > 0 ? v.value / total : 0,
    }))
    .sort((a, b) => b.value - a.value || b.spendCents - a.spendCents);
  return { metric, lines };
}

export interface AudienceAge {
  age: string;
  female: number;
  male: number;
  unknown: number;
}

export interface Audience {
  metric: BreakdownMetric;
  ages: AudienceAge[];
  totals: { female: number; male: number; unknown: number };
  /** A faixa e o gênero com mais resultado ("Mulheres de 35 a 44 anos"). */
  top: { age: string; gender: 'female' | 'male'; value: number } | null;
}

const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

/** "35-44" → "35 a 44"; "65+" → "65 ou mais". */
export const ageLabel = (age: string) => (age.endsWith('+') ? `${age.slice(0, -1)} ou mais` : age.replace('-', ' a '));

/** Idade e gênero de quem respondeu ao anúncio. */
export function buildAudience(rows: readonly BreakdownRow[]): Audience {
  const metric = pickMetric(rows);
  const porIdade = new Map<string, AudienceAge>();
  const totals = { female: 0, male: 0, unknown: 0 };
  for (const r of rows) {
    const age = r.keys.age ?? 'unknown';
    const g = r.keys.gender === 'female' ? 'female' : r.keys.gender === 'male' ? 'male' : 'unknown';
    const v = r[metric];
    if (v <= 0 || age === 'unknown') {
      totals[g] += Math.max(0, v);
      continue;
    }
    const a = porIdade.get(age) ?? { age, female: 0, male: 0, unknown: 0 };
    a[g] += v;
    porIdade.set(age, a);
    totals[g] += v;
  }
  const ordem = (a: string) => (AGE_ORDER.indexOf(a) === -1 ? 99 : AGE_ORDER.indexOf(a));
  const ages = [...porIdade.values()].sort((a, b) => ordem(a.age) - ordem(b.age) || a.age.localeCompare(b.age));
  let top: Audience['top'] = null;
  for (const a of ages) {
    for (const g of ['female', 'male'] as const) if (a[g] > 0 && (!top || a[g] > top.value)) top = { age: a.age, gender: g, value: a[g] };
  }
  return { metric, ages, totals, top };
}

/** A que horas do dia o anúncio rendeu (0 a 23, no horário da conta de anúncios). */
export function buildAdHours(rows: readonly BreakdownRow[]): { metric: BreakdownMetric; hours: number[]; peak: number | null } {
  const metric = pickMetric(rows);
  const hours = Array<number>(24).fill(0);
  for (const r of rows) {
    const h = Number((r.keys.hourly_stats_aggregated_by_advertiser_time_zone ?? '').slice(0, 2));
    if (Number.isInteger(h) && h >= 0 && h <= 23) hours[h] += r[metric];
  }
  const max = Math.max(...hours);
  return { metric, hours, peak: max > 0 ? hours.indexOf(max) : null };
}

// ─── As contas ───────────────────────────────────────────────────────────────

/** Custo por unidade, em centavos. Sem unidades, não há custo a mostrar. */
export const costPer = (spendCents: number, n: number): number | null => (n > 0 ? Math.round(spendCents / n) : null);

/** Retorno: quanto voltou para cada real investido. Sem gasto, não há retorno. */
export const roasOf = (revenueCents: number, spendCents: number): number | null =>
  spendCents > 0 ? revenueCents / spendCents : null;

/** Parte sobre o todo (0 a 1). Sem todo, não há taxa. */
export const rate = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** Variação contra o período anterior, em fração (0,25 = subiu 25%). */
export function change(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

export type Tone = 'good' | 'bad' | 'neutral';

/** A variação é boa ou ruim? Em custo, cair é bom. Menos de 0,5% é empate. */
export function changeTone(delta: number | null, lowerIsBetter: boolean): Tone {
  if (delta == null || Math.abs(delta) < 0.005) return 'neutral';
  return delta < 0 === lowerIsBetter ? 'good' : 'bad';
}

export type RoasStatus = 'good' | 'warn' | 'bad' | 'none';

/** Verde a partir de 3x; âmbar de 1x a 3x; vermelho abaixo de 1x ou gastou e ninguém fechou. */
export function roasStatus(roas: number | null, spendCents: number, won: number): RoasStatus {
  if (spendCents <= 0) return 'none';
  if (won === 0 || roas == null || roas < 1) return 'bad';
  return roas >= 3 ? 'good' : 'warn';
}

// ─── CRM: o que aconteceu com quem veio de anúncio ───────────────────────────

export type CrmEventKind = 'lead' | 'scheduled' | 'attended' | 'won';

/** Uma linha agregada do banco: quantos, de qual anúncio, em qual dia. */
export interface CrmEventRow {
  adId: string | null;
  kind: CrmEventKind;
  day: string;
  n: number;
  cents: number;
}

export interface CrmTotals {
  leads: number;
  scheduled: number;
  attended: number;
  won: number;
  revenueCents: number;
}

const ZERO: CrmTotals = { leads: 0, scheduled: 0, attended: 0, won: 0, revenueCents: 0 };

function somar(t: CrmTotals, r: CrmEventRow): CrmTotals {
  if (r.kind === 'lead') return { ...t, leads: t.leads + r.n };
  if (r.kind === 'scheduled') return { ...t, scheduled: t.scheduled + r.n };
  if (r.kind === 'attended') return { ...t, attended: t.attended + r.n };
  return { ...t, won: t.won + r.n, revenueCents: t.revenueCents + r.cents };
}

export const crmTotals = (rows: readonly CrmEventRow[]): CrmTotals => rows.reduce(somar, ZERO);

// ─── O relatório ─────────────────────────────────────────────────────────────

export interface AdInfo {
  name: string | null;
  campaignId: string | null;
  campaignName: string | null;
  thumbnailUrl: string | null;
}

export interface ReportLine {
  id: string;
  name: string;
  spendCents: number;
  conversations: number;
  costPerConversationCents: number | null;
  scheduled: number;
  won: number;
  revenueCents: number;
  roas: number | null;
  status: RoasStatus;
}

export interface AdLine extends ReportLine {
  thumbnailUrl: string | null;
}

export interface CampaignLine extends ReportLine {
  ads: AdLine[];
}

export interface Kpi {
  value: number | null;
  previous: number | null;
  change: number | null;
  tone: Tone;
  /** Uma série curta para a minilinha (nulo = sem dado naquele trecho). */
  trend: (number | null)[];
}

export interface FunnelStep {
  key: 'reach' | 'clicks' | 'conversations' | 'scheduled' | 'attended' | 'won';
  label: string;
  value: number;
  source: 'meta' | 'crm';
  /** Quanto sobrou da etapa anterior (0 a 1); nulo na primeira. */
  ofPrevious: number | null;
}

export interface DailyPoint {
  label: string;
  tick: string;
  spendCents: number;
  conversations: number;
  scheduled: number;
}

export interface AdsReport {
  campaigns: { id: string; name: string }[];
  /** A campanha do filtro, se existir no período. */
  campaignId: string | null;
  kpis: {
    spend: Kpi;
    costPerConversation: Kpi;
    costPerScheduled: Kpi;
    costPerPatient: Kpi;
    roas: Kpi;
  };
  funnel: FunnelStep[];
  daily: DailyPoint[];
  lines: CampaignLine[];
  totals: { spendCents: number; conversations: number; scheduled: number; attended: number; won: number; revenueCents: number };
  /** Os números de entrega do anúncio: quantas vezes apareceu, para quantas pessoas e quanto custou aparecer. */
  delivery: {
    impressions: number;
    reach: number;
    clicks: number;
    /** Cliques ÷ exibições (0 a 1). */
    ctr: number | null;
    /** Custo de mil exibições, em centavos. */
    cpmCents: number | null;
    /** Quantas vezes, em média, cada pessoa viu o anúncio. */
    frequency: number | null;
    /** Valor médio de cada negócio fechado, em centavos. */
    ticketCents: number | null;
  };
  /** Leads de anúncios que a conta conectada não conhece (outra conta, anúncio apagado). */
  unmatched: CrmTotals;
  /** Há qualquer número no período (da Meta ou do CRM)? */
  empty: boolean;
}

export interface ReportInput {
  /** Dias do período escolhido, em ordem. */
  days: readonly string[];
  /** Por campanha e por dia, cobrindo o período anterior e o atual. */
  campaignDaily: readonly InsightRow[];
  /** Por anúncio, só o período atual. */
  adTotals: readonly InsightRow[];
  /** Alcance do período atual: da conta inteira e de cada campanha (alcance não se soma). */
  accountReach: number;
  campaignReach: ReadonlyMap<string, number>;
  adInfo: ReadonlyMap<string, AdInfo>;
  crmCurrent: readonly CrmEventRow[];
  crmPrevious: readonly CrmEventRow[];
  /** Filtro de campanha (id), ou nulo para todas. */
  campaignId: string | null;
  /** Quantas barras cabem no gráfico por dia. */
  maxBars?: number;
  /** Quantos pontos tem a minilinha. */
  trendPoints?: number;
}

const SEM_NOME = 'Campanha sem nome';

function kpi(value: number | null, previous: number | null, lowerIsBetter: boolean, trend: (number | null)[]): Kpi {
  const delta = change(value, previous);
  return { value, previous, change: delta, tone: changeTone(delta, lowerIsBetter), trend };
}

function linha(id: string, name: string, m: { spendCents: number; conversations: number }, c: CrmTotals): ReportLine {
  const roas = roasOf(c.revenueCents, m.spendCents);
  return {
    id,
    name,
    spendCents: m.spendCents,
    conversations: m.conversations,
    costPerConversationCents: costPer(m.spendCents, m.conversations),
    scheduled: c.scheduled,
    won: c.won,
    revenueCents: c.revenueCents,
    roas,
    status: roasStatus(roas, m.spendCents, c.won),
  };
}

/** Junta Meta e CRM no que a tela mostra. */
export function buildAdsReport(input: ReportInput): AdsReport {
  const { days, adInfo } = input;
  const [primeiro, ultimo] = [days[0] ?? '', days[days.length - 1] ?? ''];
  const noPeriodo = (r: InsightRow) => r.day !== null && r.day >= primeiro && r.day <= ultimo;

  // De qual campanha é cada anúncio: o que a Meta disse no período, ou a ficha do anúncio.
  const campanhaDoAnuncio = new Map<string, string>();
  for (const r of input.adTotals) if (r.adId && r.campaignId) campanhaDoAnuncio.set(r.adId, r.campaignId);
  for (const [id, info] of adInfo) if (info.campaignId && !campanhaDoAnuncio.has(id)) campanhaDoAnuncio.set(id, info.campaignId);

  // As campanhas que existem no período (para o filtro), pelo nome.
  const nomes = new Map<string, string>();
  for (const r of input.campaignDaily) if (r.campaignId && noPeriodo(r)) nomes.set(r.campaignId, r.campaignName ?? SEM_NOME);
  for (const r of input.crmCurrent) {
    const camp = r.adId ? campanhaDoAnuncio.get(r.adId) : undefined;
    if (camp && !nomes.has(camp)) nomes.set(camp, adInfo.get(r.adId!)?.campaignName ?? SEM_NOME);
  }
  const campaigns = [...nomes.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const filtro = input.campaignId && nomes.has(input.campaignId) ? input.campaignId : null;

  const daCampanha = (id: string | null) => !filtro || id === filtro;
  const meta = input.campaignDaily.filter((r) => daCampanha(r.campaignId));
  const metaAtual = meta.filter(noPeriodo);
  const metaAntes = meta.filter((r) => r.day !== null && r.day < primeiro);
  const crmDe = (rows: readonly CrmEventRow[]) =>
    rows.filter((r) => {
      const camp = r.adId ? campanhaDoAnuncio.get(r.adId) ?? null : null;
      return camp !== null && daCampanha(camp);
    });
  const crmAtual = crmDe(input.crmCurrent);
  const crmAntes = crmDe(input.crmPrevious);

  const somaMeta = (rows: readonly InsightRow[]) =>
    rows.reduce(
      (s, r) => ({
        spendCents: s.spendCents + r.spendCents,
        clicks: s.clicks + r.clicks,
        conversations: s.conversations + r.conversations,
        impressions: s.impressions + r.impressions,
      }),
      { spendCents: 0, clicks: 0, conversations: 0, impressions: 0 },
    );
  const [m, mAntes] = [somaMeta(metaAtual), somaMeta(metaAntes)];
  const [c, cAntes] = [crmTotals(crmAtual), crmTotals(crmAntes)];

  // Minilinhas: o período em até N trechos, cada conta feita dentro do trecho.
  const trechos = bucketDays(days, input.trendPoints ?? 12);
  const porDia = (rows: readonly InsightRow[], campo: 'spendCents' | 'conversations') => {
    const mapa = new Map<string, number>();
    for (const r of rows) if (r.day) mapa.set(r.day, (mapa.get(r.day) ?? 0) + r[campo]);
    return mapa;
  };
  const crmPorDia = (kind: CrmEventKind, campo: 'n' | 'cents' = 'n') => {
    const mapa = new Map<string, number>();
    for (const r of crmAtual) if (r.kind === kind) mapa.set(r.day, (mapa.get(r.day) ?? 0) + r[campo]);
    return mapa;
  };
  const gastoDia = porDia(metaAtual, 'spendCents');
  const conversasDia = porDia(metaAtual, 'conversations');
  const agendouDia = crmPorDia('scheduled');
  const serie = (b: readonly Bucket[]) => ({
    gasto: sumByBucket(b, gastoDia),
    conversas: sumByBucket(b, conversasDia),
    agendou: sumByBucket(b, agendouDia),
    fechou: sumByBucket(b, crmPorDia('won')),
    receita: sumByBucket(b, crmPorDia('won', 'cents')),
  });
  const t = serie(trechos);
  const tendencia = (f: (i: number) => number | null) => (trechos.length >= 2 ? trechos.map((_, i) => f(i)) : []);

  const kpis = {
    spend: kpi(m.spendCents, mAntes.spendCents, false, tendencia((i) => t.gasto[i])),
    costPerConversation: kpi(
      costPer(m.spendCents, m.conversations),
      costPer(mAntes.spendCents, mAntes.conversations),
      true,
      tendencia((i) => costPer(t.gasto[i], t.conversas[i])),
    ),
    costPerScheduled: kpi(
      costPer(m.spendCents, c.scheduled),
      costPer(mAntes.spendCents, cAntes.scheduled),
      true,
      tendencia((i) => costPer(t.gasto[i], t.agendou[i])),
    ),
    costPerPatient: kpi(
      costPer(m.spendCents, c.won),
      costPer(mAntes.spendCents, cAntes.won),
      true,
      tendencia((i) => costPer(t.gasto[i], t.fechou[i])),
    ),
    roas: kpi(
      roasOf(c.revenueCents, m.spendCents),
      roasOf(cAntes.revenueCents, mAntes.spendCents),
      false,
      tendencia((i) => roasOf(t.receita[i], t.gasto[i])),
    ),
  };
  // Investir mais não é bom nem ruim por si: a variação do gasto fica neutra.
  kpis.spend.tone = 'neutral';

  const alcance = filtro ? input.campaignReach.get(filtro) ?? 0 : input.accountReach;
  const etapas: Omit<FunnelStep, 'ofPrevious'>[] = [
    { key: 'reach', label: 'Pessoas alcançadas', value: alcance, source: 'meta' },
    { key: 'clicks', label: 'Cliques no anúncio', value: m.clicks, source: 'meta' },
    { key: 'conversations', label: 'Conversas no WhatsApp', value: m.conversations, source: 'meta' },
    { key: 'scheduled', label: 'Agendaram', value: c.scheduled, source: 'crm' },
    { key: 'attended', label: 'Compareceram', value: c.attended, source: 'crm' },
    { key: 'won', label: 'Fecharam', value: c.won, source: 'crm' },
  ];
  const funnel = etapas.map((e, i): FunnelStep => ({ ...e, ofPrevious: i === 0 ? null : rate(e.value, etapas[i - 1].value) }));

  const barras = bucketDays(days, input.maxBars ?? 31);
  const d = serie(barras);
  const daily = barras.map((b, i): DailyPoint => ({ label: b.label, tick: b.tick, spendCents: d.gasto[i], conversations: d.conversas[i], scheduled: d.agendou[i] }));

  // A tabela: campanha → anúncios.
  const crmPorAnuncio = new Map<string, CrmTotals>();
  for (const r of crmAtual) if (r.adId) crmPorAnuncio.set(r.adId, somar(crmPorAnuncio.get(r.adId) ?? ZERO, r));
  const anuncios = new Map<string, { campaignId: string; line: AdLine }>();
  for (const r of input.adTotals) {
    if (!r.adId || !r.campaignId || !daCampanha(r.campaignId)) continue;
    const base = linha(r.adId, r.adName ?? adInfo.get(r.adId)?.name ?? 'Anúncio sem nome', r, crmPorAnuncio.get(r.adId) ?? ZERO);
    anuncios.set(r.adId, { campaignId: r.campaignId, line: { ...base, thumbnailUrl: adInfo.get(r.adId)?.thumbnailUrl ?? null } });
  }
  // Anúncio sem entrega no período, mas com resultado no CRM (clicou antes, fechou agora).
  for (const [adId, tot] of crmPorAnuncio) {
    const camp = campanhaDoAnuncio.get(adId);
    if (anuncios.has(adId) || !camp) continue;
    const info = adInfo.get(adId);
    const base = linha(adId, info?.name ?? 'Anúncio sem nome', { spendCents: 0, conversations: 0 }, tot);
    anuncios.set(adId, { campaignId: camp, line: { ...base, thumbnailUrl: info?.thumbnailUrl ?? null } });
  }

  const metaPorCampanha = new Map<string, { spendCents: number; conversations: number }>();
  for (const r of metaAtual) {
    if (!r.campaignId) continue;
    const a = metaPorCampanha.get(r.campaignId) ?? { spendCents: 0, conversations: 0 };
    metaPorCampanha.set(r.campaignId, { spendCents: a.spendCents + r.spendCents, conversations: a.conversations + r.conversations });
  }
  const crmPorCampanha = new Map<string, CrmTotals>();
  for (const r of crmAtual) {
    const camp = r.adId ? campanhaDoAnuncio.get(r.adId) : undefined;
    if (camp) crmPorCampanha.set(camp, somar(crmPorCampanha.get(camp) ?? ZERO, r));
  }
  const ids = new Set([...metaPorCampanha.keys(), ...crmPorCampanha.keys()]);
  const lines = [...ids]
    .map((id): CampaignLine => ({
      ...linha(id, nomes.get(id) ?? SEM_NOME, metaPorCampanha.get(id) ?? { spendCents: 0, conversations: 0 }, crmPorCampanha.get(id) ?? ZERO),
      ads: [...anuncios.values()]
        .filter((a) => a.campaignId === id)
        .map((a) => a.line)
        .sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name, 'pt-BR')),
    }))
    .sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name, 'pt-BR'));

  const unmatched = crmTotals(input.crmCurrent.filter((r) => !r.adId || !campanhaDoAnuncio.has(r.adId)));

  return {
    campaigns,
    campaignId: filtro,
    kpis,
    funnel,
    daily,
    lines,
    totals: { spendCents: m.spendCents, conversations: m.conversations, scheduled: c.scheduled, attended: c.attended, won: c.won, revenueCents: c.revenueCents },
    delivery: {
      impressions: m.impressions,
      reach: alcance,
      clicks: m.clicks,
      ctr: rate(m.clicks, m.impressions),
      cpmCents: m.impressions > 0 ? Math.round((m.spendCents / m.impressions) * 1000) : null,
      frequency: alcance > 0 && m.impressions > 0 ? m.impressions / alcance : null,
      ticketCents: costPer(c.revenueCents, c.won),
    },
    unmatched,
    empty: m.spendCents === 0 && m.conversations === 0 && alcance === 0 && c.leads + c.scheduled + c.attended + c.won === 0,
  };
}

// ─── Como os números aparecem ────────────────────────────────────────────────

const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inteiroBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Dinheiro com centavos: "R$ 9,06". Para custos pequenos, onde o centavo importa. */
export const formatMoney = (cents: number) => brl2.format(cents / 100);

/** "17.458" */
export const formatCount = (n: number) => inteiroBR.format(n);

/** Retorno: "14,2x". */
export const formatRoas = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;

/** Taxa: "27%"; abaixo de 10%, uma casa ("3,2%"). */
export function formatRate(v: number): string {
  const p = v * 100;
  const casas = p > 0 && p < 10 ? 1 : 0;
  return `${p.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** Variação: "+12%", "−8%". Acima de 999%, "+999%". */
export function formatChange(delta: number): string {
  const p = Math.min(999, Math.round(Math.abs(delta) * 100));
  return `${delta < 0 ? '−' : '+'}${p}%`;
}
