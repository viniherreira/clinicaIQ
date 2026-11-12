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
 * As contas de anúncios que a pessoa liberou na janela da Meta. Primeiro pela
 * lista do próprio token; se vier vazia (token de sistema às vezes não lista),
 * pelas contas que a Meta diz que o token alcança.
 */
export async function listAdAccounts(token: string, app: { id: string; secret: string }): Promise<AdAccountOption[]> {
  const direto = await graphList<unknown>('me/adaccounts', { fields: ACCOUNT_FIELDS, limit: '100' }, token, 5).catch((e) => {
    if (e instanceof MetaAdsError && e.kind !== 'other' && e.kind !== 'permission') throw e;
    return [] as unknown[];
  });
  const achadas = direto.map(toOption).filter((a): a is AdAccountOption => a !== null);
  if (achadas.length > 0) return achadas;

  const debug = await graphGet<{ data?: { granular_scopes?: { scope?: string; target_ids?: string[] }[] } }>(
    'debug_token',
    { input_token: token },
    `${app.id}|${app.secret}`,
  ).catch(() => ({ data: undefined }));
  const ids = (debug.data?.granular_scopes ?? []).filter((s) => s.scope === 'ads_read').flatMap((s) => s.target_ids ?? []);
  const contas = await Promise.all(
    [...new Set(ids)].slice(0, 25).map((id) => readAdAccount(token, id).catch(() => null)),
  );
  return contas.filter((a): a is AdAccountOption => a !== null);
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
