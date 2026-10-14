/** Shared Clerk appearance so sign-in / sign-up match the brand (teal 700 do
 *  manual, que passa de 4,5:1 com o texto branco do botão; rounded, Inter).
 *  Clerk's card keeps its own light surface for readability. */
export const clerkAppearance = {
  // A logo do quadro vem daqui, e não do painel do Clerk (que ainda tem o dente).
  layout: {
    logoImageUrl: '/brand/dreamclin-simbolo.svg',
    logoLinkUrl: '/',
    logoPlacement: 'inside' as const,
  },
  variables: {
    colorPrimary: '#0F766E',
    borderRadius: '0.625rem',
    fontFamily: 'var(--font-inter), system-ui, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    logoBox: 'h-10 justify-center',
    card: 'shadow-xl border border-black/5',
    headerTitle: 'text-xl font-semibold tracking-tight',
    formButtonPrimary: 'text-sm font-medium normal-case',
    footerActionLink: 'text-primary font-medium',
  },
};
