import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OG_IMAGE } from '@/lib/seo';
import { TRIAL_DAYS } from '@/lib/subscription';
import { LandingPage } from './landing';

// O título vai inteiro (sem o "| DreamClin" do layout): ~55 caracteres, o que
// o Google mostra sem cortar. A descrição fica abaixo de 160.
export const metadata: Metadata = {
  title: { absolute: 'Sistema e CRM para clínicas odontológicas | DreamClin' },
  description: `Agenda, prontuário com odontograma, orçamentos e CRM no WhatsApp oficial para clínicas odontológicas e de estética. Teste grátis por ${TRIAL_DAYS} dias, sem cartão.`,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'DreamClin',
    url: '/',
    title: 'DreamClin: agenda e CRM para clínicas, com WhatsApp oficial',
    description: `Do primeiro "oi" no WhatsApp ao tratamento fechado: agenda, prontuário, orçamentos e CRM integrados. Teste grátis por ${TRIAL_DAYS} dias.`,
    images: [OG_IMAGE],
  },
};

/**
 * O site de vendas é o mesmo para todo visitante, então sai pronto do cache da
 * Vercel (abre rápido; o Google mede isso) e se refaz a cada hora, para pegar
 * preço novo. Quem já entrou nem chega aqui: o middleware manda para o painel.
 */
export const revalidate = 3600;

export default function Home() {
  // Without Clerk configured (local/dev shortcut), skip straight to the app.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    redirect('/dashboard');
  }
  return <LandingPage />;
}
