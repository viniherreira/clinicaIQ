import 'server-only';
import { cache } from 'react';
import { prisma } from '@clinicaiq/db';
import { NO_SUBSCRIPTION, resolveAccess, type Access } from './subscription';

/**
 * The clinic's current access level. Cached per request so a page that checks
 * it in the layout and again in an action pays for one query.
 */
export const getTenantAccess = cache(async (tenantId: string): Promise<Access> => {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    select: {
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      graceEndsAt: true,
      cancelledAt: true,
    },
  });
  return subscription ? resolveAccess(subscription, new Date()) : NO_SUBSCRIPTION;
});

/** Thrown when a suspended clinic tries to change something. */
export class SubscriptionBlockedError extends Error {
  constructor(readonly access: Access) {
    super(access.warning ?? 'Acesso limitado.');
    this.name = 'SubscriptionBlockedError';
  }
}

/**
 * Guards a write. Reading stays open at every level — a clinic that owes us
 * money still has patients arriving, and its records are the patients', not
 * ours to withhold. Only changes are blocked.
 */
export async function assertCanWrite(tenantId: string): Promise<void> {
  const access = await getTenantAccess(tenantId);
  if (access.level !== 'full') throw new SubscriptionBlockedError(access);
}

/** Same check without throwing, for deciding what to render. */
export async function canWriteTenant(tenantId: string): Promise<boolean> {
  return (await getTenantAccess(tenantId)).level === 'full';
}

/**
 * Guarda de escrita para as Server Actions.
 *
 * Devolve a mensagem a mostrar quando a clínica não pode gravar, ou `null`
 * quando pode. Devolver em vez de lançar é o que permite cada action responder
 * no formato que o formulário dela já espera — uma exceção aqui viraria a tela
 * de erro do Next, que não explica nada a quem só precisa pagar a fatura.
 *
 * Por que não basta o aviso no layout: Server Action não passa por layout. São
 * POSTs resolvidos por id de action, então o banner do `app/(app)/layout.tsx`
 * avisa mas não impede. Sem esta checagem, uma clínica suspensa continua
 * gravando — por uma aba já aberta ou repetindo a requisição.
 *
 * Fica de fora de propósito: as actions de plano e pagamento (senão a clínica
 * bloqueada não consegue se desbloquear), o onboarding (a assinatura ainda não
 * existe) e a página pública do orçamento (quem responde ali é o paciente, que
 * não tem nada com a fatura da clínica).
 */
export async function writeBlocked(tenantId: string): Promise<string | null> {
  const access = await getTenantAccess(tenantId);
  if (access.level === 'full') return null;
  return access.warning ?? 'Acesso limitado. Regularize o plano para voltar a gravar.';
}
