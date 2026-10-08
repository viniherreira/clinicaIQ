import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@clinicaiq/db';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { SubscriptionBanner } from '@/components/subscription-banner';
import type { Space } from '@/components/module-switcher';
import { getTenantAccess, getTenantModules } from '@/lib/access';
import { can } from '@/lib/permissions';

/** Os mesmos rótulos da tela de Equipe — o perfil precisa se chamar igual nos
 *  dois lugares, senão a pessoa não relaciona um com o outro. */
const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
  PROFESSIONAL: 'Profissional',
};

/**
 * A moldura do sistema logado: menu lateral, cabeçalho, aviso de cobrança.
 *
 * Os dois espaços — a gestão da clínica e o CRM — usam a mesma moldura e só
 * trocam o menu. O seletor entre eles só aparece para quem tem os dois: a
 * clínica contratou o CRM e o perfil da pessoa alcança `crm`.
 *
 * `guard` roda depois de saber quem é e o que a clínica tem, e antes de
 * desenhar qualquer coisa — é onde o layout do CRM barra quem não deveria
 * entrar.
 */
export async function AppShell({
  space,
  guard,
  children,
}: {
  space: Space;
  guard?: (ctx: { role: string; crm: boolean }) => void;
  children: React.ReactNode;
}) {
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

  const [access, modules] = await Promise.all([
    getTenantAccess(tenant.id),
    getTenantModules(tenant.id),
  ]);

  const role = me?.role ?? '';
  guard?.({ role, crm: modules.crm });

  const showSwitcher = modules.crm && can(role, 'crm');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar clinicName={tenant.name} role={role} space={space} showSwitcher={showSwitcher} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          clinicName={tenant.name}
          userName={me?.name?.trim() || me?.email || 'Usuário'}
          userEmail={me?.email ?? ''}
          role={role}
          roleLabel={ROLE_LABEL[role] ?? 'Sem perfil'}
          canConfig={can(me?.role, 'configuracoes')}
          canPlanos={can(me?.role, 'planos')}
          space={space}
          showSwitcher={showSwitcher}
        />
        <SubscriptionBanner access={access} />
        <main id="main-content" className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
