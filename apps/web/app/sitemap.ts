import type { MetadataRoute } from 'next';

/** O endereço oficial (o dreamclin.com sem www redireciona para cá). */
const SITE = 'https://www.dreamclin.com';

/**
 * As páginas públicas que o Google deve achar (Search Console › Sitemaps:
 * `sitemap.xml`). O sistema em si fica atrás do login e de fora daqui.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/sign-up`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/privacidade`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/termos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/ajuda/conectar-whatsapp`, changeFrequency: 'monthly', priority: 0.4 },
  ];
}
