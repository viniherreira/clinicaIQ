import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { prisma } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { can, LEAST_PRIVILEGE, type Capability, type Role } from './permissions';

/**
 * Guarda de papel para as *páginas*.
 *
 * As Server Actions já barravam a gravação (`capabilityBlocked`), mas ler não
 * passava por lugar nenhum: bastava digitar /configuracoes para a recepção ver
 * a equipe inteira, o registro de auditoria e a cobrança do plano. E o menu
 * lateral listava os dez módulos para todo mundo, então nem era preciso digitar.
 *
 * Esconder o link do menu não é proteção — é arrumação. A trava é esta, que roda
 * no servidor antes da página existir.
 */

/** Quem está pedindo, e com qual papel. Em cache por requisição. */
export const currentAccess = cache(
  async (): Promise<{ tenantId: string; userId: string; role: Role } | null> => {
    const { userId } = await auth();
    if (!userId) return null;

    const user = await prisma.user
      .findFirst({
        where: { clerkUserId: userId, active: true },
        select: { id: true, tenantId: true, role: true },
      })
      .catch(() => null);
    if (!user) return null;

    // Papel desconhecido cai no menor privilégio: um valor estranho no banco não
    // pode virar acesso total por acidente.
    const role = (user.role as Role | undefined) ?? LEAST_PRIVILEGE;
    return { tenantId: user.tenantId, userId: user.id, role };
  },
);

/**
 * Interrompe a página quando o perfil não alcança o módulo.
 *
 * Manda para uma tela que explica, em vez de para o dashboard: cair no dashboard
 * sem aviso parece o sistema ter engolido o clique.
 */
export async function requireCapability(capability: Capability): Promise<{
  tenantId: string;
  userId: string;
  role: Role;
}> {
  const acesso = await currentAccess();
  if (!acesso) redirect('/sign-in');
  if (!can(acesso.role, capability)) redirect(`/sem-acesso?modulo=${capability}`);
  return acesso;
}
