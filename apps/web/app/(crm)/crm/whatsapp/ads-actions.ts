'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { guardCrmAction } from '@/crm/guard';
import * as ads from '@/crm/ads-account';
import type { AdAccountOption } from '@/crm/ads-meta';

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

/** Só gestor conecta, troca ou desconecta; depois de mudar, os números são buscados de novo. */
async function comoGestor<T extends object>(fn: (g: { tenantId: string; userId: string }) => Promise<Result<T>>): Promise<Result<T>> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const r = await fn(g);
  if (r.ok) {
    revalidateTag(ads.adsTag(g.tenantId));
    revalidatePath('/crm/whatsapp');
    revalidatePath('/crm/anuncios');
  }
  return r;
}

export const finishAdsLoginAction = async (code: string): Promise<Result<{ accounts: AdAccountOption[]; chosen: AdAccountOption | null }>> =>
  comoGestor((g) => ads.startAdsConnection(g.tenantId, g.userId, String(code ?? '')));

export const chooseAdAccountAction = async (accountId: string): Promise<Result> =>
  comoGestor((g) => ads.chooseAdAccount(g.tenantId, g.userId, String(accountId ?? '')));

export const disconnectAdsAction = async (): Promise<Result> => comoGestor((g) => ads.disconnectAds(g.tenantId, g.userId));

/** As contas que dá para escolher (para "Trocar conta"). Só leitura. */
export async function listAdAccountsAction(): Promise<Result<{ accounts: AdAccountOption[] }>> {
  const g = await guardCrmAction('crm_config', { write: false });
  if (!g.ok) return g;
  return ads.adAccountOptions(g.tenantId);
}

/** O botão "Atualizar" da tela Anúncios: busca os números da Meta de novo. */
export async function refreshAdsAction(): Promise<Result> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  if (g.ownOnly) return { ok: false, message: 'Os números dos anúncios são da clínica inteira. Peça a um gestor.' };
  revalidateTag(ads.adsTag(g.tenantId));
  revalidatePath('/crm/anuncios');
  return { ok: true };
}
