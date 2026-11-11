import type { NextConfig } from 'next';
import path from 'path';

const dev = process.env.NODE_ENV !== 'production';

/**
 * De onde o navegador pode carregar código e falar (F-10 da auditoria). Fora
 * desta lista, um script injetado não roda nem manda dados para fora.
 *
 * - Clerk (login): clerk.dreamclin.com em produção, *.clerk.accounts.dev nos
 *   testes; a verificação anti-robô vem da Cloudflare e a proteção contra
 *   fraude no cadastro, do *.protect.clerk.com (em portas fora da 443, daí o
 *   `:*` no connect-src).
 * - Meta: o SDK do botão "Conectar com a Meta" (cadastro incorporado).
 * - Sentry (alerta de erro), ViaCEP (busca de CEP), Supabase (arquivos dos
 *   pacientes, por link assinado).
 * - vercel.live: a barra de comentários das prévias da Vercel.
 *
 * `'unsafe-inline'` nos scripts porque o Next põe scripts próprios na página;
 * trocar por nonce obrigaria toda página a ser dinâmica. Um script de outro
 * endereço continua barrado. No desenvolvimento o Next precisa de eval e do
 * websocket da recarga.
 */
const CLERK = 'https://clerk.dreamclin.com https://*.clerk.accounts.dev';
const CLERK_PROTECT = 'https://*.protect.clerk.com';
const META = 'https://connect.facebook.net https://*.facebook.com https://*.facebook.net';
const SENTRY = 'https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io';
const SUPABASE = 'https://*.supabase.co';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} ${CLERK} ${CLERK_PROTECT} https://challenges.cloudflare.com ${META} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `media-src 'self' blob: ${SUPABASE}`,
  `connect-src 'self' ${CLERK} ${CLERK_PROTECT}:* https://clerk-telemetry.com ${META} ${SENTRY} ${SUPABASE} https://viacep.com.br https://vercel.live${dev ? ' ws: wss:' : ''}`,
  `frame-src 'self' ${CLERK} ${CLERK_PROTECT} https://challenges.cloudflare.com ${META} https://vercel.live`,
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SECURITY_HEADERS = [
  // HTTPS por dois anos, subdomínios inclusive. Sem `preload`: entrar na lista
  // dos navegadores é difícil de desfazer.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@clinicaiq/db', '@clinicaiq/whatsapp', '@clinicaiq/pdf', '@clinicaiq/ui'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  serverExternalPackages: ['@react-pdf/renderer'],
  // As transmissões passaram para Automações (como no Kommo).
  // Cabeçalhos de segurança em todas as respostas. Sem eles, qualquer site podia
  // abrir o DreamClin num iframe invisível e fazer a pessoa clicar em "Aceitar
  // orçamento" ou em ações da agenda sem perceber (clickjacking).
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // O link do orçamento é a própria senha: não vai no Referer para fora.
      { source: '/orcamento/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
  async redirects() {
    return [{ source: '/crm/transmissoes/:rest*', destination: '/crm/automacoes/transmissoes/:rest*', permanent: true }];
  },
  experimental: {
    serverActions: {
      // Patient file uploads (X-rays/photos) go through a server action.
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
