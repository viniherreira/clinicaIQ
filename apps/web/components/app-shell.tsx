import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@clinicaiq/db';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { SubscriptionBanner } from '@/components/subscription-banner';
import type { Space } from '@/components/module-switcher';
import { getTenantAccess, getTenantModules } from '@/lib/access';
import { can } from '@/lib/permissions';
import { effectiveCrmRole, isCrmManager, seesOnlyOwn } from '@/lib/crm-roles';
import { conversationScope } from '@/crm/scope-rules';
import { getUnitContext } from '@/lib/units';

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
  guard?: (ctx: { role: string; crm: boolean; seat: boolean; clinic: boolean }) => void;
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
    select: { id: true, name: true, email: true, role: true, crmSeat: true, crmRole: true, crmAvailable: true },
  });

  const [access, modules] = await Promise.all([
    getTenantAccess(tenant.id),
    getTenantModules(tenant.id),
  ]);

  const role = me?.role ?? '';
  const seat = Boolean(me?.crmSeat) || modules.crmWholeTeam;
  guard?.({ role, crm: modules.crm, seat, clinic: modules.clinic });
  const crmOnly = !modules.clinic;

  // O seletor só aparece para quem consegue entrar no CRM.
  const showSwitcher = modules.crm && seat && can(role, 'crm');
  const crmRole = effectiveCrmRole(role, me?.crmRole);
  const crmManager = isCrmManager(crmRole);

  // Conversas não lidas, no menu do CRM.
  const unread =
    space === 'crm' && showSwitcher
      ? await prisma.conversation
          .count({
            where: {
              tenantId: tenant.id,
              status: { not: 'DECLINED' },
              unreadCount: { gt: 0 },
              // Atendente "só os dele" conta as suas e as sem responsável.
              ...(me && seesOnlyOwn(crmRole) ? conversationScope({ userId: me.id, ownOnly: true }) : {}),
            },
          })
          .catch(() => 0)
      : 0;

  // Várias unidades: o seletor no topo (só no espaço da clínica; o CRM é da clínica toda).
  const unidades = space === 'clinic' && me ? await getUnitContext(tenant.id, me.id) : null;
  const units =
    unidades?.multi && unidades.allowed.length > 1
      ? { current: unidades.current.id, options: unidades.allowed.map((u) => ({ id: u.id, name: u.name, address: u.address })) }
      : null;

  // `relative` + `overflow-clip`: os textos só para leitor de tela (sr-only, absolutos)
  // dentro das listas longas não podem esticar a página — a tela de Conversas
  // ficava com uma rolagem enorme e vazia embaixo.
  return (
    <div className="relative flex h-screen overflow-clip bg-background">
      <AppSidebar
        clinicName={tenant.name}
        role={role}
        space={space}
        showSwitcher={showSwitcher}
        counts={{ '/crm/conversas': unread }}
        crmOnly={crmOnly}
        crmManager={crmManager}
      />
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
          units={units}
          crmOnly={crmOnly}
          crmManager={crmManager}
          crmAvailable={space === 'crm' && showSwitcher ? (me?.crmAvailable ?? true) : undefined}
        />
        <SubscriptionBanner access={access} />
        <main id="main-content" className="flex-1 overflow-auto bg-canvas">
          {children}
        </main>
      </div>
    </div>
  );
}
