import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@clinicaiq/db', '@clinicaiq/whatsapp', '@clinicaiq/pdf', '@clinicaiq/ui'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    serverActions: {
      // Patient file uploads (X-rays/photos) go through a server action.
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
