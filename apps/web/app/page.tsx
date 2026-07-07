import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LandingPage } from './landing';

export const metadata: Metadata = {
  title: 'ClinicaIQ — Gestão inteligente para clínicas odontológicas e estéticas',
  description:
    'Agenda por profissional, confirmação automática pelo WhatsApp, orçamentos com link e PDF, ficha clínica com odontograma e financeiro claro. Sistema de gestão para clínicas, grátis no acesso antecipado.',
  keywords: [
    'sistema para clínica odontológica',
    'software para dentista',
    'gestão de clínica estética',
    'agenda para clínica',
    'confirmação de consulta WhatsApp',
    'orçamento odontológico',
    'odontograma digital',
  ],
  openGraph: {
    title: 'ClinicaIQ — Gestão inteligente para clínicas',
    description:
      'Agenda, WhatsApp automático, orçamentos, odontograma e financeiro em um só lugar. Grátis no acesso antecipado.',
    locale: 'pt_BR',
    type: 'website',
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
