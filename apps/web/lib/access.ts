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
