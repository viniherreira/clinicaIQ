import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@odontoflow/db', '@odontoflow/whatsapp', '@odontoflow/pdf', '@odontoflow/ui'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  serverExternalPackages: [],
};

export default nextConfig;
