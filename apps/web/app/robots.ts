import type { MetadataRoute } from 'next';

/**
 * O que os buscadores podem ler. Fora: as telas do sistema (atrás do login de
 * qualquer jeito), a API e os links de orçamento dos pacientes — cada um tem
 * nome e valores e não pode aparecer no Google.
 */
export default function robots(): MetadataRoute.Robots {
  const producao = process.env.VERCEL_ENV === 'production';
  return {
    // Prévias da Vercel não entram no Google: só o site oficial.
    rules: producao
      ? [{ userAgent: '*', allow: '/', disallow: ['/api/', '/orcamento/', '/onboarding', '/sign-in', '/dashboard', '/crm', '/agenda', '/pacientes', '/orcamentos', '/financeiro', '/configuracoes'] }]
      : [{ userAgent: '*', disallow: '/' }],
    sitemap: 'https://www.dreamclin.com/sitemap.xml',
    host: 'https://www.dreamclin.com',
  };
}
