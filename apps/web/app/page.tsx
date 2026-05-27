import { redirect } from 'next/navigation';

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    redirect('/dashboard');
    return;
  }

  const { auth } = await import('@clerk/nextjs/server');
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  redirect('/sign-in');
}
