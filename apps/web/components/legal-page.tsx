import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from './logo';
import { COMPANY, companyLine } from '@/lib/company';

/** Moldura das páginas públicas de texto (Privacidade, Termos): logo, título, data e o texto. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={`${COMPANY.brand}, página inicial`}>
            <Logo size="md" />
          </Link>
          <Link href="/" className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao site
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: {updated}</p>
        <div
          className={[
            'mt-8 space-y-4 text-[15px] leading-relaxed text-foreground/90',
            '[&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground',
            '[&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground',
            '[&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6',
            '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
          ].join(' ')}
        >
          {children}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <p>© {new Date().getFullYear()} {COMPANY.brand}{companyLine() ? ` · ${companyLine()}` : ''}</p>
          <nav aria-label="Páginas legais" className="flex gap-4">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos de uso</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Como falar com a empresa sobre dados pessoais. */
export function PrivacyContact() {
  return COMPANY.privacyEmail ? (
    <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>
  ) : (
    <>pelo canal de suporte dentro do sistema</>
  );
}
