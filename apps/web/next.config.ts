import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@clinicaiq/db', '@clinicaiq/whatsapp', '@clinicaiq/pdf', '@clinicaiq/ui'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default nextConfig;
