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
  '/api/health', // monitor de site fora do ar: só diz se está de pé
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
  // Quem já entrou e abre o site vai direto para o painel. Fica aqui, e não na
  // página, para o site de vendas sair pronto do cache (mais rápido no Google).
  if (request.nextUrl.pathname === '/' && (await auth()).userId) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
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
