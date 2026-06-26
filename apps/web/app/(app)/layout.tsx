import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@clinicaiq/db';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true, name: true },
  });
  if (!tenant) redirect('/onboarding');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar clinicName={tenant.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader clinicName={tenant.name} />
        <main id="main-content" className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
