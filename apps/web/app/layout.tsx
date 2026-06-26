import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ClinicaIQ',
    template: '%s | ClinicaIQ',
  },
  description: 'Gestão inteligente para clínicas odontológicas e estéticas',
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
        <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
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
