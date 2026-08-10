import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@clinicaiq/db';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { SubscriptionBanner } from '@/components/subscription-banner';
import { getTenantAccess } from '@/lib/access';

/** Os mesmos rótulos da tela de Equipe — o perfil precisa se chamar igual nos
 *  dois lugares, senão a pessoa não relaciona um com o outro. */
const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
  PROFESSIONAL: 'Profissional',
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId, active: true } } },
    select: { id: true, name: true },
  });
  if (!tenant) redirect('/onboarding');

  // Quem está logado agora. Vem da mesma linha que decide as permissões, não do
  // Clerk: assim o nome no topo e o que a pessoa consegue fazer nunca divergem.
  const me = await prisma.user.findFirst({
    where: { clerkUserId: userId, tenantId: tenant.id, active: true },
    select: { name: true, email: true, role: true },
  });

  const access = await getTenantAccess(tenant.id);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar clinicName={tenant.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          clinicName={tenant.name}
          userName={me?.name?.trim() || me?.email || 'Usuário'}
          roleLabel={ROLE_LABEL[me?.role ?? ''] ?? 'Sem perfil'}
        />
        <SubscriptionBanner access={access} />
        <main id="main-content" className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
