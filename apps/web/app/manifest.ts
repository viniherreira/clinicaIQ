import type { MetadataRoute } from 'next';

/** Nome, cores e ícones quando a pessoa instala o DreamClin no celular. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DreamClin',
    short_name: 'DreamClin',
    description: 'Gestão inteligente para clínicas odontológicas e estéticas',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FAFAF8',
    theme_color: '#14B8A6',
    lang: 'pt-BR',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
