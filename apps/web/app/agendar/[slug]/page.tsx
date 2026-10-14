import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LogoMark } from '@/components/logo';
import { clinicNow } from '@/lib/availability';
import { getBookingInfo } from './actions';
import { BookingFlow } from './booking-flow';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const info = await getBookingInfo((await params).slug);
  return {
    title: info ? `Agendar horário · ${info.name}` : 'Agendamento online',
    robots: { index: false },
  };
}

/** A página pública de agendamento de uma clínica: /agendar/[endereço da clínica]. */
export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const info = await getBookingInfo(slug);
  if (!info) notFound();

  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-base font-bold text-primary-hover" aria-hidden="true">
            {info.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{info.name}</p>
            {info.address && <p className="truncate text-xs text-muted-foreground">{info.address}</p>}
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Agende seu horário</h1>
        <p className="mt-1 text-sm text-muted-foreground">Escolha o profissional, o dia e o horário. A confirmação chega pelo WhatsApp.</p>
        <BookingFlow
          slug={slug}
          units={info.units}
          professionals={info.professionals}
          procedures={info.procedures}
          today={clinicNow().date}
          maxDaysAhead={info.maxDaysAhead}
        />
      </main>

      <footer className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 pb-8 text-xs text-muted-foreground">
        <LogoMark size="xs" />
        <span>Agendamento por DreamClin</span>
        <span aria-hidden="true">·</span>
        <a href="/privacidade" className="underline underline-offset-2 hover:text-foreground">
          Privacidade
        </a>
      </footer>
    </div>
  );
}
