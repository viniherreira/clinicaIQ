import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@clinicaiq/db', '@clinicaiq/whatsapp', '@clinicaiq/pdf', '@clinicaiq/ui'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  serverExternalPackages: ['@react-pdf/renderer'],
  // As transmissões passaram para Automações (como no Kommo).
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
