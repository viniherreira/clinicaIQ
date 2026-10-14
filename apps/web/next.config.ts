import type { NextConfig } from 'next';
import path from 'path';

const SECURITY_HEADERS = [
  // HTTPS por dois anos, subdomínios inclusive. Sem `preload`: entrar na lista
  // dos navegadores é difícil de desfazer.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
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
