import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo';

/**
 * As páginas públicas que o Google deve achar (Search Console › Sitemaps:
 * `sitemap.xml`). O sistema em si fica atrás do login e de fora daqui.
 *
 * `lastModified`: a data da última mudança de verdade no texto de cada página
 * (o Google usa para saber quando voltar). Atualize ao mexer no conteúdo.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, lastModified: '2026-11-10', changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/sign-up`, lastModified: '2026-11-10', changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/ajuda/conectar-whatsapp`, lastModified: '2026-10-26', changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/privacidade`, lastModified: '2026-10-12', changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE}/termos`, lastModified: '2026-10-26', changeFrequency: 'yearly', priority: 0.3 },
  ];
}
