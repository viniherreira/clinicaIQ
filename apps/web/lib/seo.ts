import type { Metadata } from 'next';
import { productAvailable, productPriceCents, PRODUCT_INFO, PRODUCTS, type PlanPrices } from '@/lib/products';

/** O endereço oficial (o dreamclin.com sem www redireciona para cá). */
export const SITE = 'https://www.dreamclin.com';

/** A imagem que aparece quando alguém compartilha um link do site. */
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'DreamClin: agenda e CRM para clínicas' };

/**
 * Título, descrição, canônico e prévia de compartilhamento de uma página
 * pública. O título vai sem a marca: o "| DreamClin" vem do layout. O canônico
 * diz ao Google qual é o endereço oficial (`/sign-up?plano=crm` é o mesmo que
 * `/sign-up`).
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'DreamClin',
      title: `${title} | DreamClin`,
      description,
      url: path,
      images: [OG_IMAGE],
    },
  };
}

/** As perguntas do site, como o Google entende (FAQPage). */
export function faqJsonLd(faqs: readonly { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

const reais = (cents: number) => (cents / 100).toFixed(2);

/**
 * Quem somos e o que vendemos, para o Google e os assistentes de IA: a empresa,
 * o site e o software com os preços de verdade (do banco, os mesmos da tabela
 * de planos). Sem planos carregados, sai sem preço em vez de inventar.
 */
export function homeJsonLd(plans: readonly PlanPrices[], trialDays: number) {
  const ofertas = PRODUCTS.flatMap((produto) => {
    const precos = plans
      .filter((plan) => productAvailable(plan, produto))
      .map((plan) => productPriceCents(plan, produto))
      .filter((v) => v > 0);
    if (!precos.length) return [];
    return [
      {
        '@type': 'AggregateOffer',
        name: `DreamClin ${PRODUCT_INFO[produto].name}`,
        description: PRODUCT_INFO[produto].tagline,
        priceCurrency: 'BRL',
        lowPrice: reais(Math.min(...precos)),
        highPrice: reais(Math.max(...precos)),
        offerCount: precos.length,
        url: `${SITE}/#planos`,
      },
    ];
  });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organizacao`,
        name: 'DreamClin',
        url: `${SITE}/`,
        logo: `${SITE}/brand/icon-512.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#site`,
        name: 'DreamClin',
        url: `${SITE}/`,
        inLanguage: 'pt-BR',
        publisher: { '@id': `${SITE}/#organizacao` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE}/#software`,
        name: 'DreamClin',
        url: `${SITE}/`,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Sistema de gestão e CRM para clínicas odontológicas e de estética',
        operatingSystem: 'Web, Android, iOS (no navegador)',
        inLanguage: 'pt-BR',
        description:
          'Agenda por profissional, prontuário com odontograma, orçamentos com link de aprovação, financeiro e CRM no WhatsApp oficial da Meta, num só sistema para clínicas.',
        featureList: [
          'Agenda por profissional e agendamento online',
          'Confirmação de consulta pelo WhatsApp oficial',
          'Prontuário com odontograma',
          'Orçamentos com link de aprovação e PDF',
          'Financeiro',
          'CRM com funil, conversas do WhatsApp e robô de atendimento',
          'Transmissões pelo WhatsApp',
        ],
        image: `${SITE}/og.png`,
        publisher: { '@id': `${SITE}/#organizacao` },
        ...(ofertas.length ? { offers: ofertas } : {}),
        potentialAction: { '@type': 'TryAction', name: `Testar grátis por ${trialDays} dias`, target: `${SITE}/sign-up` },
      },
    ],
  };
}

/**
 * O JSON dentro do `<script type="application/ld+json">`. Troca o `<` para um
 * texto do banco nunca fechar a tag `</script>` antes da hora.
 */
export const jsonLdHtml = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, '\\u003c') });
