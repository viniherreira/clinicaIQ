import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';
import { siteUrl } from '@/lib/company';
import { OG_IMAGE } from '@/lib/seo';
import './globals.css';

// A fonte do manual de marca.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

const DESCRICAO =
  'Agenda, prontuário com odontograma, orçamentos e CRM no WhatsApp oficial para clínicas odontológicas e de estética.';

export const metadata: Metadata = {
  // Base dos endereços da imagem de compartilhamento e do canônico: o WhatsApp
  // só mostra a prévia com URL completa. No Preview da Vercel, o próprio
  // endereço do deploy (que o robots.txt deixa fora do Google).
  metadataBase: new URL(
    process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : siteUrl(),
  ),
  // Cada página escreve só o próprio título; o "| DreamClin" vem daqui.
  title: {
    default: 'DreamClin: sistema e CRM para clínicas odontológicas',
    template: '%s | DreamClin',
  },
  description: DESCRICAO,
  applicationName: 'DreamClin',
  // Toda página compartilhada no WhatsApp ou nas redes leva a imagem da marca;
  // a página que quiser outra troca só o que precisar.
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'DreamClin',
    images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
  formatDetection: { telephone: false },
  // Código do Google Search Console (Configurações › Verificação › Tag HTML),
  // pela variável da Vercel, sem mexer no código. Sem ela, nada sai.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  // Prova à Meta que o domínio dreamclin.com é nosso (verificação da empresa).
  // Não é segredo e precisa ficar: tirar desverifica o domínio.
  other: { 'facebook-domain-verification': 'vr6uyznl2ojvq1aymv8st4ogtktq7w' },
};

/**
 * O login (Clerk) não entra aqui: só nos layouts que o usam
 * (`components/auth-provider.tsx`), para o site de vendas abrir leve.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Set the theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${GeistMono.variable} font-sans antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
        >
          Pular para o conteúdo principal
        </a>
        {children}
      </body>
    </html>
  );
}
