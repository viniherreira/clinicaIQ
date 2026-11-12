import 'server-only';

import { graphVersion } from '@/lib/cloud-account';
import { accountNumber, classifyMetaError, parseInsight, type AdInfo, type InsightRow, type MetaErrorKind } from './ads-rules';

/**
 * As chamadas à Meta da tela Anúncios (Marketing API, só leitura). O token vai
 * sempre no cabeçalho, nunca no endereço, e nunca é escrito em log.
 */

export class MetaAdsError extends Error {
  constructor(
    readonly kind: MetaErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'MetaAdsError';
  }
}

const base = () => `https://graph.facebook.com/${graphVersion()}`;

async function graphGet<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(`${base()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  } catch {
    throw new MetaAdsError('other', 'A Meta demorou para responder. Tente de novo em instantes.');
  }
  const body = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const e = classifyMetaError(res.status, body);
    throw new MetaAdsError(e.kind, e.message);
  }
  return body;
}

interface Paged<T> {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/** Segue as páginas pelo cursor (o endereço "next" da Meta traz o token; não é usado). */
async function graphList<T>(path: string, params: Record<string, string>, token: string, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page: Paged<T> = await graphGet(path, after ? { ...params, after } : params, token);
    out.push(...(page.data ?? []));
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

// ─── Contas de anúncios ──────────────────────────────────────────────────────

export interface AdAccountOption {
  id: string;
  name: string;
  currency: string | null;
  /** Gasto de toda a vida da conta, em centavos. */
  spentCents: number;
}

const ACCOUNT_FIELDS = 'name,account_id,currency,amount_spent';

function toOption(raw: unknown): AdAccountOption | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const id = accountNumber(r.account_id ?? r.id);
  if (!id) return null;
  // `amount_spent` já vem em centavos (diferente de `spend` nos insights).
  const gasto = Number(r.amount_spent);
  return {
    id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `Conta ${id}`,
    currency: typeof r.currency === 'string' ? r.currency : null,
    spentCents: Number.isFinite(gasto) && gasto > 0 ? Math.round(gasto) : 0,
  };
}

/**
 * As contas de anúncios que a pessoa liberou na janela da Meta. O token que a
 * Meta entrega aqui é de um "usuário do sistema" criado na hora, e nem sempre a
 * lista direta devolve as contas: por isso são vários caminhos, do mais simples
 * ao mais indireto, e vale o primeiro que achar alguma conta.
 *
 * Deixa no log quantas contas cada caminho achou (só números e nomes de
 * permissão, nunca o token), para dar para entender uma conexão que não lista nada.
 */
export async function listAdAccounts(token: string, app: { id: string; secret: string }): Promise<AdAccountOption[]> {
  const passos: Record<string, number | string> = {};
  const tentar = async (nome: string, fn: () => Promise<unknown[]>): Promise<AdAccountOption[]> => {
    try {
      const contas = (await fn()).map(toOption).filter((a): a is AdAccountOption => a !== null);
      passos[nome] = contas.length;
      return contas;
    } catch (e) {
      // Token inválido ou pausa da Meta: não adianta tentar os outros caminhos.
      if (e instanceof MetaAdsError && (e.kind === 'auth' || e.kind === 'rate')) throw e;
      passos[nome] = e instanceof MetaAdsError ? `erro:${e.kind}` : 'erro';
      return [];
    }
  };
  const lista = (path: string) => () => graphList<unknown>(path, { fields: ACCOUNT_FIELDS, limit: '100' }, token, 5);
  const fim = (contas: AdAccountOption[]) => {
    console.info('[crm] contas de anúncios na conexão', passos);
    const unicas = new Map(contas.map((c) => [c.id, c]));
    return [...unicas.values()];
  };

  let contas = await tentar('me/adaccounts', lista('me/adaccounts'));
  if (contas.length) return fim(contas);
  contas = await tentar('me/assigned_ad_accounts', lista('me/assigned_ad_accounts'));
  if (contas.length) return fim(contas);

  // O que a Meta diz que este token alcança: contas de anúncios e empresas.
  const debug = await graphGet<{ data?: { granular_scopes?: { scope?: string; target_ids?: string[] }[] } }>(
    'debug_token',
    { input_token: token },
    `${app.id}|${app.secret}`,
  ).catch(() => ({ data: undefined }));
  const escopos = debug.data?.granular_scopes ?? [];
  passos.escopos = escopos.map((e) => `${e.scope}:${e.target_ids?.length ?? 'todos'}`).join(',') || 'nenhum';
  const alvos = (nomes: string[]) => [...new Set(escopos.filter((e) => nomes.includes(e.scope ?? '')).flatMap((e) => e.target_ids ?? []))];

  contas = await tentar('alvos-de-ads_read', async () =>
    (await Promise.all(alvos(['ads_read', 'ads_management']).slice(0, 25).map((id) => graphGet<unknown>(`act_${id.replace(/^act_/, '')}`, { fields: ACCOUNT_FIELDS }, token).catch(() => null)))).filter(
      (x) => x !== null,
    ),
  );
  if (contas.length) return fim(contas);

  // As contas das empresas que o token alcança (da própria empresa e as compartilhadas com ela).
  const eu = await graphGet<{ client_business_id?: string }>('me', { fields: 'client_business_id' }, token).catch(() => ({ client_business_id: undefined }));
  const empresas = [...new Set([eu.client_business_id, ...alvos(['business_management'])].filter((id): id is string => !!id && /^\d{5,25}$/.test(id)))].slice(0, 5);
  passos.empresas = empresas.length;
  for (const empresa of empresas) {
    contas = [
      ...(await tentar(`empresa/owned_ad_accounts`, lista(`${empresa}/owned_ad_accounts`))),
      ...(await tentar(`empresa/client_ad_accounts`, lista(`${empresa}/client_ad_accounts`))),
    ];
    if (contas.length) return fim(contas);
  }
  return fim([]);
}

/** Uma conta, lida com o token: é assim que se confere se o token alcança a conta escolhida. */
export async function readAdAccount(token: string, accountId: string): Promise<AdAccountOption | null> {
  const id = accountNumber(accountId);
  if (!id) return null;
  return toOption(await graphGet<unknown>(`act_${id}`, { fields: ACCOUNT_FIELDS }, token));
}

// ─── Resultados (insights) ───────────────────────────────────────────────────

export type InsightLevel = 'account' | 'campaign' | 'ad';

const FIELDS: Record<InsightLevel, string> = {
  account: 'spend,impressions,reach,clicks,inline_link_clicks,actions',
  campaign: 'campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,actions',
  ad: 'campaign_id,campaign_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions',
};

export async function fetchInsights(
  token: string,
  accountId: string,
  q: { since: string; until: string; level: InsightLevel; daily?: boolean },
): Promise<InsightRow[]> {
  const rows = await graphList<unknown>(
    `act_${accountId}/insights`,
    {
      level: q.level,
      fields: FIELDS[q.level],
      time_range: JSON.stringify({ since: q.since, until: q.until }),
      ...(q.daily ? { time_increment: '1' } : {}),
      limit: '500',
    },
    token,
  );
  return rows.map(parseInsight);
}

/** A ficha de cada anúncio: nome, campanha e miniatura. Em lotes de 50. */
export async function fetchAdInfo(token: string, adIds: readonly string[]): Promise<Map<string, AdInfo>> {
  const ids = [...new Set(adIds)].filter((id) => /^\d{5,25}$/.test(id));
  const out = new Map<string, AdInfo>();
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    // Um anúncio que a conta não alcança (outra conta, apagado) derruba o lote inteiro:
    // nesse caso, tenta um a um e ignora o que falhar.
    const fichas = await graphGet<Record<string, unknown>>('', { ids: lote.join(','), fields: 'name,campaign{id,name},creative{thumbnail_url}' }, token).catch(
      async (e) => {
        if (e instanceof MetaAdsError && (e.kind === 'rate' || e.kind === 'auth')) throw e;
        const um = await Promise.all(
          lote.map((id) =>
            graphGet<unknown>(id, { fields: 'name,campaign{id,name},creative{thumbnail_url}' }, token)
              .then((v) => [id, v] as const)
              .catch(() => null),
          ),
        );
        return Object.fromEntries(um.filter((x): x is readonly [string, unknown] => x !== null));
      },
    );
    for (const id of lote) {
      const f = fichas[id] as { name?: unknown; campaign?: { id?: unknown; name?: unknown }; creative?: { thumbnail_url?: unknown } } | undefined;
      if (!f) continue;
      const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      const miniatura = s(f.creative?.thumbnail_url);
      out.set(id, {
        name: s(f.name),
        campaignId: s(f.campaign?.id),
        campaignName: s(f.campaign?.name),
        thumbnailUrl: miniatura && /^https:\/\//i.test(miniatura) ? miniatura : null,
      });
    }
  }
  return out;
}
