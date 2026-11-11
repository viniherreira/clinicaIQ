import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo';

/**
 * O que os buscadores podem ler. Fora: as telas do sistema (atrás do login de
 * qualquer jeito), a API e os links de orçamento dos pacientes — cada um tem
 * nome e valores e não pode aparecer no Google.
 *
 * O /sign-in não entra aqui de propósito: ele tem `noindex` na página, e o
 * Google só lê o `noindex` do que pode abrir.
 */
const SISTEMA = [
  '/api/',
  '/orcamento/',
  '/onboarding',
  '/dashboard',
  '/crm',
  '/agenda',
  '/pacientes',
  '/orcamentos',
  '/financeiro',
  '/configuracoes',
  '/procedimentos',
  '/campanhas',
  '/retorno',
  '/whatsapp',
  '/planos',
  '/relatorios',
  '/sem-acesso',
  '/crm-indisponivel',
];

export default function robots(): MetadataRoute.Robots {
  const producao = process.env.VERCEL_ENV === 'production';
  return {
    // Prévias da Vercel não entram no Google: só o site oficial.
    rules: producao ? [{ userAgent: '*', allow: '/', disallow: SISTEMA }] : [{ userAgent: '*', disallow: '/' }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
