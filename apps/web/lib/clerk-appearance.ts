/** Shared Clerk appearance so sign-in / sign-up match the brand (azul-saúde da
 *  logo, rounded, Geist). Clerk's card keeps its own light surface for readability. */
export const clerkAppearance = {
  variables: {
    colorPrimary: '#1669C7',
    borderRadius: '0.625rem',
    fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    card: 'shadow-xl border border-black/5',
    headerTitle: 'text-xl font-semibold tracking-tight',
    formButtonPrimary: 'text-sm font-medium normal-case',
    footerActionLink: 'text-primary font-medium',
  },
};
