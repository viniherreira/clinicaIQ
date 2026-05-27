import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const isPublicRoute = (pathname: string) =>
  pathname.startsWith('/sign-in') ||
  pathname.startsWith('/sign-up') ||
  pathname.startsWith('/orcamento/') ||
  pathname.startsWith('/api/webhooks/');

export default async function middleware(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return NextResponse.next();
  }

  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');
  const isPublic = createRouteMatcher([
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/orcamento/(.*)',
    '/api/webhooks/(.*)',
  ]);

  return clerkMiddleware(async (auth, request) => {
    if (!isPublic(request)) {
      await auth.protect();
    }
  })(req, {} as never);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
