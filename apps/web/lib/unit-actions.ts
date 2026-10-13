'use server';

import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@clinicaiq/db';
import { getUnitContext, UNIT_COOKIE } from './units';

/** Troca a unidade do topo. Só vale unidade que a pessoa pode ver. */
export async function chooseUnitAction(unitId: string): Promise<{ ok: boolean }> {
  const { userId } = await auth();
  if (!userId) return { ok: false };
  const me = await prisma.user.findFirst({ where: { clerkUserId: userId, active: true }, select: { id: true, tenantId: true } });
  if (!me) return { ok: false };
  const { allowed } = await getUnitContext(me.tenantId, me.id);
  if (!allowed.some((u) => u.id === unitId)) return { ok: false };
  (await cookies()).set(UNIT_COOKIE, unitId, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, httpOnly: true });
  revalidatePath('/', 'layout');
  return { ok: true };
}
