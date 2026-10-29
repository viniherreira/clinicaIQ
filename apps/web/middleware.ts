import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/onboarding',
  '/orcamento/(.*)',
  '/privacidade',
  '/termos',
  '/ajuda/(.*)', // passo a passo para clientes: o suporte manda o link antes do login
  '/sitemap.xml', // Google Search Console
  '/robots.txt',
  '/agendar/(.*)', // agendamento online: público, sem login
  '/api/webhooks/(.*)',
  '/api/cron/(.*)', // Vercel Cron authenticates via CRON_SECRET, not Clerk
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
  // O caminho vai junto para o layout do sistema, que não o recebe: a clínica
  // só com o CRM é levada para o CRM quando abre uma tela da agenda.
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
