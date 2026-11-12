import 'server-only';

import { prisma, Prisma } from '@clinicaiq/db';
import { unstable_cache } from 'next/cache';
import { adsConnection, adsCredentials, adsTag, type AdsConnection } from './ads-account';
import { fetchAdInfo, fetchInsights, MetaAdsError, type InsightLevel } from './ads-meta';
import { buildAdsReport, type AdInfo, type AdsReport, type CrmEventKind, type CrmEventRow, type InsightRow, type MetaErrorKind } from './ads-rules';
import { daysOf, reportRange, type DayRange, type ReportPeriodKey } from './report-period';

/**
 * A tela Anúncios: busca os números da Meta (com cache de 15 minutos por
 * clínica) e o que aconteceu no CRM com quem veio de anúncio, e junta os dois
 * com as regras de `ads-rules.ts`. Nada é guardado no banco.
 */

const CACHE_SECONDS = 900;

// ─── CRM: agendou, compareceu e fechou, por anúncio e por dia ────────────────

const KINDS = new Set<CrmEventKind>(['lead', 'scheduled', 'attended', 'won']);

/**
 * O que aconteceu, no período, com os leads que vieram de anúncio. O anúncio
 * de cada lead é o da primeira mensagem com anúncio na conversa dele
 * (`chat_messages.ad.sourceId`). Agregado no banco: volta uma linha por
 * anúncio, tipo e dia.
 */
export async function adLeadEvents(tenantId: string, r: Pick<DayRange, 'from' | 'to'>): Promise<CrmEventRow[]> {
  const etapas = await prisma.pipelineStage.findMany({
    where: { tenantId, role: { in: ['SCHEDULED', 'ATTENDED'] } },
    select: { id: true, role: true },
  });
  const agendou = etapas.filter((e) => e.role === 'SCHEDULED').map((e) => e.id);
  const compareceu = etapas.filter((e) => e.role === 'ATTENDED').map((e) => e.id);
  // Lista vazia no ANY() não casa com nada; um id impossível mantém o SQL igual.
  const lista = (ids: string[]) => (ids.length ? ids : ['-']);

  const rows = await prisma.$queryRaw<{ ad_id: string | null; kind: string; day: string; n: number; cents: bigint | number | null }[]>(Prisma.sql`
    WITH ad_leads AS (
      SELECT DISTINCT ON (c."leadId") c."leadId" AS lead_id, m."ad"->>'sourceId' AS ad_id, m."at" AS at
      FROM "chat_messages" m
      JOIN "conversations" c ON c."id" = m."conversationId" AND c."tenantId" = ${tenantId}
      JOIN "leads" l ON l."id" = c."leadId" AND l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL
      WHERE m."tenantId" = ${tenantId} AND m."direction" = 'INBOUND'
        AND m."ad" IS NOT NULL AND jsonb_typeof(m."ad") = 'object'
      ORDER BY c."leadId", m."at" ASC
    ),
    ev AS (
      SELECT al.ad_id, 'lead' AS kind, al.at AS at, 0 AS cents
      FROM ad_leads al
      WHERE al.at >= ${r.from} AND al.at < ${r.to}
      UNION ALL
      SELECT al.ad_id, 'scheduled', min(a."createdAt"), 0
      FROM "lead_activities" a
      JOIN ad_leads al ON al.lead_id = a."leadId"
      WHERE a."tenantId" = ${tenantId} AND a."type" = 'STAGE_CHANGED'
        AND a."createdAt" >= ${r.from} AND a."createdAt" < ${r.to}
        AND a."data"->>'to' = ANY(${lista(agendou)})
      GROUP BY al.ad_id, a."leadId"
      UNION ALL
      SELECT al.ad_id, 'attended', min(a."createdAt"), 0
      FROM "lead_activities" a
      JOIN ad_leads al ON al.lead_id = a."leadId"
      WHERE a."tenantId" = ${tenantId} AND a."type" = 'STAGE_CHANGED'
        AND a."createdAt" >= ${r.from} AND a."createdAt" < ${r.to}
        AND a."data"->>'to' = ANY(${lista(compareceu)})
      GROUP BY al.ad_id, a."leadId"
      UNION ALL
      SELECT al.ad_id, 'won', l."wonAt", COALESCE(l."estimatedValueCents", 0)
      FROM "leads" l
      JOIN ad_leads al ON al.lead_id = l."id"
      WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL
        AND l."wonAt" >= ${r.from} AND l."wonAt" < ${r.to}
    )
    SELECT ad_id, kind,
      to_char((at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
      count(*)::int AS n, sum(cents)::bigint AS cents
    FROM ev
    GROUP BY 1, 2, 3
  `);

  return rows
    .filter((x) => KINDS.has(x.kind as CrmEventKind))
    .map((x) => ({ adId: x.ad_id && /^\d{5,25}$/.test(x.ad_id) ? x.ad_id : null, kind: x.kind as CrmEventKind, day: x.day, n: x.n, cents: Number(x.cents ?? 0) }));
}

// ─── Meta, com cache ─────────────────────────────────────────────────────────

export interface MetaFetchers {
  insights(tenantId: string, accountId: string, q: { since: string; until: string; level: InsightLevel; daily: boolean }): Promise<{ rows: InsightRow[]; at: number }>;
  adInfo(tenantId: string, accountId: string, adIds: string[]): Promise<[string, AdInfo][]>;
}

async function tokenFor(tenantId: string, accountId: string): Promise<string> {
  const cred = await adsCredentials(tenantId);
  // A conta mudou entre montar a tela e buscar: não usa o token numa conta que não é mais a escolhida.
  if (!cred || cred.accountId !== accountId) throw new MetaAdsError('auth', 'A conexão com o Gerenciador de Anúncios mudou. Atualize a página.');
  return cred.token;
}

/** Direto na Meta, sem cache (os testes usam este). */
export const liveFetchers: MetaFetchers = {
  async insights(tenantId, accountId, q) {
    return { rows: await fetchInsights(await tokenFor(tenantId, accountId), accountId, q), at: Date.now() };
  },
  async adInfo(tenantId, accountId, adIds) {
    return [...(await fetchAdInfo(await tokenFor(tenantId, accountId), adIds))];
  },
};

/**
 * Com cache de 15 minutos. A chave é a clínica, a conta e o pedido; o token é
 * lido dentro, para nunca entrar na chave. "Atualizar" derruba a etiqueta.
 */
export const cachedFetchers: MetaFetchers = {
  insights: (tenantId, accountId, q) =>
    unstable_cache(() => liveFetchers.insights(tenantId, accountId, q), ['ads-insights', tenantId, accountId, q.since, q.until, q.level, String(q.daily)], {
      revalidate: CACHE_SECONDS,
      tags: [adsTag(tenantId)],
    })(),
  adInfo: (tenantId, accountId, adIds) => {
    const ids = [...new Set(adIds)].sort();
    return unstable_cache(() => liveFetchers.adInfo(tenantId, accountId, ids), ['ads-info', tenantId, accountId, ids.join(',')], {
      revalidate: CACHE_SECONDS,
      tags: [adsTag(tenantId)],
    })();
  },
};

// ─── A tela ──────────────────────────────────────────────────────────────────

export type AdsPageData =
  | { state: 'not_connected' | 'choosing'; connection: AdsConnection }
  | { state: 'error'; connection: AdsConnection; kind: MetaErrorKind; message: string }
  | { state: 'ok'; connection: AdsConnection; report: AdsReport; range: DayRange; fetchedAt: string };

export async function loadAdsPage(
  tenantId: string,
  period: ReportPeriodKey,
  campaignId: string | null,
  opts: { now?: Date; fetchers?: MetaFetchers } = {},
): Promise<AdsPageData> {
  const connection = await adsConnection(tenantId);
  if (connection.state === 'none') return { state: 'not_connected', connection };
  if (connection.state === 'choosing' || !connection.accountId) return { state: 'choosing', connection };

  const meta = opts.fetchers ?? cachedFetchers;
  const conta = connection.accountId;
  const { current, previous } = reportRange(period, opts.now);

  try {
    const [porCampanhaDia, porCampanha, daConta, porAnuncio, crmAtual, crmAntes] = await Promise.all([
      meta.insights(tenantId, conta, { since: previous.since, until: current.until, level: 'campaign', daily: true }),
      meta.insights(tenantId, conta, { since: current.since, until: current.until, level: 'campaign', daily: false }),
      meta.insights(tenantId, conta, { since: current.since, until: current.until, level: 'account', daily: false }),
      meta.insights(tenantId, conta, { since: current.since, until: current.until, level: 'ad', daily: false }),
      adLeadEvents(tenantId, current),
      adLeadEvents(tenantId, previous),
    ]);

    const anuncios = new Set<string>();
    for (const r of porAnuncio.rows) if (r.adId) anuncios.add(r.adId);
    for (const r of [...crmAtual, ...crmAntes]) if (r.adId) anuncios.add(r.adId);
    // Sem a ficha, a tela ainda funciona: só ficam sem miniatura (e sem campanha os anúncios antigos).
    const fichas = anuncios.size
      ? await meta.adInfo(tenantId, conta, [...anuncios].slice(0, 400)).catch((e) => {
          if (e instanceof MetaAdsError && e.kind === 'auth') throw e;
          return [] as [string, AdInfo][];
        })
      : [];

    const report = buildAdsReport({
      days: daysOf(current),
      campaignDaily: porCampanhaDia.rows,
      adTotals: porAnuncio.rows,
      accountReach: daConta.rows[0]?.reach ?? 0,
      campaignReach: new Map(porCampanha.rows.filter((r) => r.campaignId).map((r) => [r.campaignId!, r.reach])),
      adInfo: new Map(fichas),
      crmCurrent: crmAtual,
      crmPrevious: crmAntes,
      campaignId,
    });
    const at = Math.min(porCampanhaDia.at, porCampanha.at, daConta.at, porAnuncio.at);
    return { state: 'ok', connection, report, range: current, fetchedAt: new Date(at).toISOString() };
  } catch (e) {
    if (e instanceof MetaAdsError) return { state: 'error', connection, kind: e.kind, message: e.message };
    console.error('[crm] tela de anúncios falhou', { tenantId, message: e instanceof Error ? e.name : 'erro desconhecido' });
    return { state: 'error', connection, kind: 'other', message: 'Não foi possível montar os números agora. Tente de novo.' };
  }
}
