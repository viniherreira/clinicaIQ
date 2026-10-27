import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LandingPage } from './landing';

export const metadata: Metadata = {
  title: 'DreamClin | Agenda e CRM com WhatsApp oficial para clínicas odontológicas e de estética',
  description:
    'Agenda, prontuário com odontograma, orçamentos e CRM no WhatsApp oficial da Meta, num só sistema para clínicas. O funil anda sozinho quando a recepção agenda. Planos Agenda, CRM e Completo: 14 dias grátis, sem cartão.',
  keywords: [
    'sistema para clínica odontológica',
    'CRM para clínica',
    'CRM odontológico',
    'software para dentista',
    'gestão de clínica estética',
    'agenda para clínica',
    'WhatsApp API oficial para clínica',
    'confirmação de consulta WhatsApp',
    'orçamento odontológico',
    'odontograma digital',
  ],
  openGraph: {
    title: 'DreamClin | Agenda e CRM para clínicas, com WhatsApp oficial',
    description:
      'Do primeiro "oi" no WhatsApp ao tratamento fechado: agenda, prontuário, orçamentos e CRM integrados. Teste grátis por 14 dias.',
    locale: 'pt_BR',
    type: 'website',
    siteName: 'DreamClin',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'DreamClin: agenda e CRM para clínicas' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
  },
};

export default async function Home() {
  // Without Clerk configured (local/dev shortcut), skip straight to the app.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    redirect('/dashboard');
  }

  const { auth } = await import('@clerk/nextjs/server');
  const { userId } = await auth();

  // Signed-in users land on their dashboard; visitors see the marketing page.
  if (userId) {
    redirect('/dashboard');
  }

  return <LandingPage />;
}
