import 'server-only';

import { decrypt, prisma, type Prisma } from '@clinicaiq/db';
import { exchangeSignupCode } from '@clinicaiq/whatsapp';
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

/** O que o botão precisa para abrir a janela (nada disso é segredo). */
export function adsLoginConfig(): { appId: string; configId: string; version: string } | null {
  return adsConfigured()
    ? { appId: process.env.META_APP_ID!, configId: process.env.META_ADS_CONFIG_ID!, version: graphVersion() }
    : null;
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
  const { ads: _antes, ...resto } = all;
  const novo = ads ? { ...resto, ads: { ...ads } } : resto;
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: novo as Prisma.InputJsonValue } });
}

async function audit(tenantId: string, userId: string | null, action: string, metadata: object = {}) {
  await prisma.auditLog
    .create({ data: { tenantId, userId, action, entity: 'AdsAccount', entityId: tenantId, metadata } })
    .catch(() => undefined);
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
  code: string,
): Promise<Result<{ accounts: AdAccountOption[]; chosen: AdAccountOption | null }>> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret || !adsConfigured()) return { ok: false, message: 'A conexão com a Meta ainda não está configurada no servidor.' };
  if (!code || code.length > 2000) return { ok: false, message: 'A Meta não devolveu a autorização. Tente de novo.' };

  let token: string;
  let accounts: AdAccountOption[];
  try {
    token = await exchangeSignupCode({ appId, appSecret, code, version: graphVersion() });
    accounts = await listAdAccounts(token, { id: appId, secret: appSecret });
  } catch (e) {
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
