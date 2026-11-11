import type { TenantPrismaClient } from '@clinicaiq/db';
import { normalize } from './bot-engine';
import type { CrmColor } from './defaults';
import { applyChannelTag } from './auto-tags';

/**
 * De onde veio o contato: anúncio do Facebook, do Instagram ou o site. A Meta
 * manda o anúncio (`referral`) junto com a primeira mensagem de quem tocou em
 * "Enviar mensagem" num anúncio; o site não manda nada, então vale a frase
 * que o botão do site já escreve ("Vim pelo site").
 *
 * O lead ganha a origem e uma tag (facebook, instagram ou site), e o
 * histórico diz de qual anúncio veio. Chamado por `afterInbound`.
 */

export type OriginKey = 'FACEBOOK' | 'INSTAGRAM' | 'SITE';

/** O que importa do anúncio para a origem (o resto fica na mensagem). */
export interface AdLite {
  sourceUrl?: string | null;
  headline?: string | null;
}

export const ORIGIN_TAG: Record<OriginKey, { name: string; color: CrmColor; label: string }> = {
  FACEBOOK: { name: 'facebook', color: 'blue', label: 'Facebook' },
  INSTAGRAM: { name: 'instagram', color: 'pink', label: 'Instagram' },
  SITE: { name: 'site', color: 'teal', label: 'site' },
};

/** "Vim pelo site", "vi no site de vocês", "mensagem do site"… */
const SITE = /(^| )(pelo|do|no|via|seu|meu) (site|website)( |$)/;

/**
 * A origem: anúncio com link do Instagram é Instagram; outro anúncio é
 * Facebook (a Meta não diz em qual dos dois a pessoa viu, e o link do anúncio
 * é fb.me). Sem anúncio, a frase do site na primeira mensagem.
 */
export function originOf(ad: AdLite | null | undefined, firstText: string): OriginKey | null {
  if (ad) return /(^|\.|\/\/)(instagram\.com|instagr\.am)\b/i.test(ad.sourceUrl ?? '') ? 'INSTAGRAM' : 'FACEBOOK';
  return SITE.test(normalize(firstText)) ? 'SITE' : null;
}

/** O anúncio guardado na mensagem (`chat_messages.ad`), sem confiar na forma. */
export function readAd(raw: unknown): (AdLite & { body: string | null; imageUrl: string | null; mediaType: string | null }) | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const url = (v: unknown) => {
    const t = s(v);
    return t && /^https:\/\//i.test(t) ? t : null;
  };
  const ad = {
    sourceUrl: url(r.sourceUrl),
    headline: s(r.headline),
    body: s(r.body),
    // Vídeo: a miniatura é a imagem do card.
    imageUrl: url(r.imageUrl) ?? url(r.thumbnailUrl),
    mediaType: s(r.mediaType),
  };
  return ad.sourceUrl || ad.headline || ad.body ? ad : null;
}

/**
 * Põe a origem no lead: a tag, a origem (anúncio sempre manda; o site só
 * troca a origem genérica WhatsApp) e, com anúncio, uma nota no histórico.
 */
export async function applyOrigin(
  db: TenantPrismaClient,
  tenantId: string,
  leadId: string,
  key: OriginKey,
  ad: AdLite | null,
): Promise<void> {
  const lead = await db.lead.findFirst({ where: { id: leadId }, select: { source: true } });
  if (!lead) return;
  const trocar = key !== 'SITE' ? lead.source !== key : lead.source === 'WHATSAPP' || lead.source === 'MANUAL';
  if (trocar) await db.lead.updateMany({ where: { id: leadId }, data: { source: key } });

  // A tag do canal (a "whatsapp" genérica sai, se estava).
  await applyChannelTag(db, tenantId, leadId, key);

  if (ad) {
    const titulo = ad.headline ? ` “${ad.headline.slice(0, 120)}”` : '';
    await db.leadActivity.create({
      data: { tenantId, leadId, type: 'NOTE', actorId: null, data: { text: `Veio do anúncio${titulo} (${ORIGIN_TAG[key].label}).` } },
    });
  }
}
