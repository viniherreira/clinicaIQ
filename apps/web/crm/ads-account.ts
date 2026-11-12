import 'server-only';

import { decrypt, prisma, type Prisma } from '@clinicaiq/db';
import { graphVersion, sealToken } from '@/lib/cloud-account';
import { accountNumber, readAdsSettings, type AdsSettings } from './ads-rules';
import { listAdAccounts, MetaAdsError, readAdAccount, type AdAccountOption } from './ads-meta';

/**
 * A conexão da clínica com o Gerenciador de Anúncios (só leitura). A pessoa
 * entra pela janela da Meta; o token que a Meta entrega fica cifrado em
 * `Tenant.settings.ads` e nunca vai para o navegador nem para o log.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

/** A etiqueta do cache dos números da Meta desta clínica. */
export const adsTag = (tenantId: string) => `ads:${tenantId}`;

/** O servidor tem o que precisa para abrir a janela da Meta? */
export function adsConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_ADS_CONFIG_ID);
}

/**
 * Como a janela da Meta devolve a autorização:
 * - 'token' (padrão): configuração de token de pessoa. A janela entrega o token
 *   direto; trocar código dá erro de endereço de retorno no SDK da Meta.
 * - 'code': configuração de token de usuário do sistema (exige código). Ligar
 *   com META_ADS_FLOW=code quando voltar a ela.
 */
export type AdsFlow = 'token' | 'code';
export const adsFlow = (): AdsFlow => (process.env.META_ADS_FLOW?.trim() === 'code' ? 'code' : 'token');

/** O que o botão precisa para abrir a janela (nada disso é segredo). */
export function adsLoginConfig(): { appId: string; configId: string; version: string; flow: AdsFlow } | null {
  return adsConfigured()
    ? { appId: process.env.META_APP_ID!, configId: process.env.META_ADS_CONFIG_ID!, version: graphVersion(), flow: adsFlow() }
    : null;
}

/**
 * Confere com a Meta que o token veio do nosso app e é válido, antes de usar.
 * Sem isso, alguém poderia mandar um token de outro app.
 */
async function checkUserToken(token: string, appId: string, appSecret: string): Promise<boolean> {
  try {
    const url = new URL(`https://graph.facebook.com/${graphVersion()}/debug_token`);
    url.searchParams.set('input_token', token);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${appId}|${appSecret}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    const body = (await res.json().catch(() => ({}))) as { data?: { is_valid?: boolean; app_id?: string; scopes?: string[] } };
    const ok = res.ok && body.data?.is_valid === true && body.data.app_id === appId;
    if (!ok) console.error('[crm] token dos anúncios recusado', { status: res.status, valido: body.data?.is_valid ?? null, mesmoApp: body.data?.app_id === appId });
    else console.info('[crm] token dos anúncios conferido', { permissoes: (body.data?.scopes ?? []).join(',') });
    return ok;
  } catch {
    return false;
  }
}

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

async function readSettings(tenantId: string): Promise<{ all: Record<string, unknown>; ads: AdsSettings | null }> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const all = t?.settings && typeof t.settings === 'object' && !Array.isArray(t.settings) ? (t.settings as Record<string, unknown>) : {};
  return { all, ads: readAdsSettings(all) };
}

/** Grava só a parte `ads` das configurações; o resto do JSON fica como está. */
async function writeAds(tenantId: string, ads: AdsSettings | null): Promise<void> {
  const { all } = await readSettings(tenantId);
  const novo: Record<string, unknown> = { ...all };
  if (ads) novo.ads = { ...ads };
  else delete novo.ads;
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: novo as Prisma.InputJsonValue } });
}

async function audit(tenantId: string, userId: string | null, action: string, metadata: object = {}) {
  await prisma.auditLog
    .create({ data: { tenantId, userId, action, entity: 'AdsAccount', entityId: tenantId, metadata } })
    .catch(() => undefined);
}

/** O erro da troca, para o registro: só códigos e o texto da Meta sem nada que pareça token. */
function oauthFailure(status: number, body: unknown): string {
  const e = (body as { error?: { code?: number; error_subcode?: number; type?: string; message?: string } } | null)?.error;
  const msg = (e?.message ?? '').replace(/EAA[A-Za-z0-9]+/g, '[token]').slice(0, 200);
  return `${status}:${e?.code ?? '?'}${e?.error_subcode ? `/${e.error_subcode}` : ''}:${e?.type ?? ''}:${msg}`;
}

/**
 * Troca o código da janela da Meta pelo token. Primeiro do jeito do cadastro do
 * WhatsApp (sem endereço de retorno); se a Meta pedir o endereço, tenta com o
 * da página e com o vazio. Cada tentativa que falha vai para o registro.
 */
async function exchangeCode(code: string, appId: string, appSecret: string, pageUrl: string | null): Promise<string> {
  const tentativas: (string | null)[] = [null, ''];
  if (pageUrl) tentativas.splice(1, 0, pageUrl);
  const falhas: string[] = [];
  for (const redirect of tentativas) {
    const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);
    if (redirect !== null) url.searchParams.set('redirect_uri', redirect);
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    } catch {
      falhas.push(`${redirect === null ? 'sem' : redirect === '' ? 'vazio' : 'pagina'}:rede`);
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as { access_token?: string };
    if (res.ok && body.access_token) {
      if (falhas.length) console.info('[crm] troca do código dos anúncios', { falhas, valeu: redirect === null ? 'sem' : redirect === '' ? 'vazio' : 'pagina' });
      return body.access_token;
    }
    falhas.push(`${redirect === null ? 'sem' : redirect === '' ? 'vazio' : 'pagina'}:${oauthFailure(res.status, body)}`);
    // Código vencido ou já usado: não adianta tentar de novo.
    if (/expired|been used|has been used/i.test(JSON.stringify(body))) break;
  }
  console.error('[crm] troca do código dos anúncios falhou', { falhas });
  throw new MetaAdsError('other', 'A Meta não aceitou a autorização. Clique em Conectar de novo; se repetir, avise o suporte.');
}

/** Troca um token de pessoa pelo de longa duração (60 dias). Nulo se a Meta não trocar. */
async function longLivedToken(token: string, appId: string, appSecret: string): Promise<string | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: token }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string };
    return res.ok && body.access_token ? body.access_token : null;
  } catch {
    return null;
  }
}

const why = (e: unknown) => (e instanceof MetaAdsError ? e.message : 'Não foi possível falar com a Meta agora. Tente de novo.');

function tokenOf(tenantId: string, ads: AdsSettings): string | null {
  try {
    return decrypt(ads.tokenEncrypted, masterKey(), tenantId);
  } catch {
    return null;
  }
}

export interface AdsConnection {
  state: 'none' | 'choosing' | 'connected';
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  connectedAt: string | null;
}

/** O que a tela mostra da conexão (nunca o token). */
export async function adsConnection(tenantId: string): Promise<AdsConnection> {
  const { ads } = await readSettings(tenantId);
  if (!ads) return { state: 'none', accountId: null, accountName: null, currency: null, connectedAt: null };
  return {
    state: ads.accountId ? 'connected' : 'choosing',
    accountId: ads.accountId,
    accountName: ads.accountName,
    currency: ads.currency,
    connectedAt: ads.connectedAt,
  };
}

/** Token e conta para ler os números. Nulo: não conectou, ou falta escolher a conta. */
export async function adsCredentials(tenantId: string): Promise<{ token: string; accountId: string } | null> {
  const { ads } = await readSettings(tenantId);
  if (!ads?.accountId) return null;
  const token = tokenOf(tenantId, ads);
  return token ? { token, accountId: ads.accountId } : null;
}

/**
 * Fim da janela da Meta: troca o código pelo token, guarda cifrado e devolve
 * as contas de anúncios para a pessoa escolher. Com uma conta só, já escolhe.
 */
export async function startAdsConnection(
  tenantId: string,
  userId: string | null,
  /** O que a janela da Meta devolveu: código (token de sistema) ou o token de pessoa. */
  auth: { code?: string | null; accessToken?: string | null },
  /** A página onde a janela da Meta foi aberta: algumas trocas de código pedem o mesmo endereço. */
  pageUrl?: string | null,
): Promise<Result<{ accounts: AdAccountOption[]; chosen: AdAccountOption | null }>> {
  const code = typeof auth.code === 'string' ? auth.code : '';
  const direto = typeof auth.accessToken === 'string' ? auth.accessToken : '';
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret || !adsConfigured()) return { ok: false, message: 'A conexão com a Meta ainda não está configurada no servidor.' };
  if ((!code && !direto) || code.length > 2000 || direto.length > 2000) {
    return { ok: false, message: 'A Meta não devolveu a autorização. Tente de novo.' };
  }

  let token: string;
  let accounts: AdAccountOption[];
  try {
    if (direto) {
      if (!(await checkUserToken(direto, appId, appSecret))) return { ok: false, message: 'A Meta não confirmou a autorização. Clique em Conectar de novo.' };
      token = direto;
    } else {
      token = await exchangeCode(code, appId, appSecret, pageUrl ?? null);
    }
    // Token de pessoa dura 1 a 2 horas: troca pelo de 60 dias. Token de sistema não troca (e não precisa).
    token = (await longLivedToken(token, appId, appSecret)) ?? token;
    accounts = await listAdAccounts(token, { id: appId, secret: appSecret });
  } catch (e) {
    if (!(e instanceof MetaAdsError)) console.error('[crm] conexão dos anúncios falhou', { tenantId, erro: e instanceof Error ? e.name : 'desconhecido' });
    return { ok: false, message: why(e) };
  }
  if (accounts.length === 0) {
    return {
      ok: false,
      message: 'Nenhuma conta de anúncios foi liberada. Conecte de novo e, na janela da Meta, marque a conta de anúncios da clínica.',
    };
  }

  const chosen = accounts.length === 1 ? accounts[0] : null;
  await writeAds(tenantId, {
    tokenEncrypted: sealToken(token, tenantId),
    accountId: chosen?.id ?? null,
    accountName: chosen?.name ?? null,
    currency: chosen?.currency ?? null,
    connectedAt: new Date().toISOString(),
    connectedById: userId,
  });
  await audit(tenantId, userId, 'ADS_CONNECTED', { accounts: accounts.length, accountId: chosen?.id ?? null });
  return { ok: true, accounts, chosen };
}

/** As contas que o token guardado alcança (para escolher ou trocar). */
export async function adAccountOptions(tenantId: string): Promise<Result<{ accounts: AdAccountOption[] }>> {
  const { ads } = await readSettings(tenantId);
  const token = ads ? tokenOf(tenantId, ads) : null;
  if (!ads || !token) return { ok: false, message: 'Conecte o Gerenciador de Anúncios primeiro.' };
  try {
    const accounts = await listAdAccounts(token, { id: process.env.META_APP_ID ?? '', secret: process.env.META_APP_SECRET ?? '' });
    return { ok: true, accounts };
  } catch (e) {
    return { ok: false, message: why(e) };
  }
}

/** Escolhe (ou troca) a conta. Confere com a Meta que o token alcança a conta pedida. */
export async function chooseAdAccount(tenantId: string, userId: string | null, accountId: string): Promise<Result> {
  const id = accountNumber(accountId);
  const { ads } = await readSettings(tenantId);
  const token = ads ? tokenOf(tenantId, ads) : null;
  if (!ads || !token) return { ok: false, message: 'Conecte o Gerenciador de Anúncios primeiro.' };
  if (!id) return { ok: false, message: 'Conta de anúncios inválida.' };
  let conta: AdAccountOption | null;
  try {
    conta = await readAdAccount(token, id);
  } catch (e) {
    return { ok: false, message: why(e) };
  }
  if (!conta) return { ok: false, message: 'A Meta não deixou ler esta conta de anúncios.' };
  await writeAds(tenantId, { ...ads, accountId: conta.id, accountName: conta.name, currency: conta.currency });
  await audit(tenantId, userId, 'ADS_ACCOUNT_CHOSEN', { accountId: conta.id });
  return { ok: true };
}

/** Desliga: apaga o token e a conta. Nada do CRM é apagado. */
export async function disconnectAds(tenantId: string, userId: string | null): Promise<Result> {
  const { ads } = await readSettings(tenantId);
  if (!ads) return { ok: false, message: 'O Gerenciador de Anúncios não está conectado.' };
  await writeAds(tenantId, null);
  await audit(tenantId, userId, 'ADS_DISCONNECTED', { accountId: ads.accountId });
  return { ok: true };
}
