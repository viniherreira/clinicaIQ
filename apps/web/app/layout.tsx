import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import { Inter } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';
import { siteUrl } from '@/lib/company';
import './globals.css';

// A fonte do manual de marca.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  // Base dos endereços da imagem de compartilhamento: o WhatsApp só mostra a
  // prévia com URL completa.
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'DreamClin',
    template: '%s | DreamClin',
  },
  description: 'Gestão inteligente para clínicas odontológicas e estéticas',
  // Prova à Meta que o domínio dreamclin.com é nosso (verificação da empresa).
  // Não é segredo e precisa ficar: tirar desverifica o domínio.
  other: { 'facebook-domain-verification': 'vr6uyznl2ojvq1aymv8st4ogtktq7w' },
};

function Providers({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>;
  }

  return <ClerkProvider localization={ptBR}>{children}</ClerkProvider>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
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
    </Providers>
  );
}
