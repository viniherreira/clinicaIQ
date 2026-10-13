import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { prisma, type ClinicUnit } from '@clinicaiq/db';
import { allowedUnits, mainUnit, pickUnit } from './unit-rules';

/**
 * Unidades da clínica no servidor. Regras puras em `unit-rules.ts`.
 *
 * Toda clínica tem pelo menos uma: na primeira leitura, a principal nasce com
 * o nome, o endereço e o telefone da clínica.
 */

export const UNIT_COOKIE = 'clinicaiq-unidade';

export const listUnits = cache(async (tenantId: string): Promise<ClinicUnit[]> => {
  const units = await prisma.clinicUnit.findMany({ where: { tenantId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  if (units.length) return units;
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, phone: true, email: true, address: true, zipCode: true, street: true, addressNumber: true, complement: true, neighborhood: true, city: true, state: true },
  });
  if (!t) return [];
  // Duas telas podem chegar juntas: quem chegar segundo lê a que já existe.
  const id = `un_${tenantId}`;
  await prisma.clinicUnit.upsert({
    where: { id },
    update: {},
    create: { id, tenantId, ...t, order: 0 },
  });
  return prisma.clinicUnit.findMany({ where: { tenantId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
});

export interface UnitContext {
  /** Todas (ativas e desativadas), na ordem. */
  all: ClinicUnit[];
  main: ClinicUnit;
  /** As que esta pessoa vê. */
  allowed: ClinicUnit[];
  /** A escolhida no topo (cookie). */
  current: ClinicUnit;
  /** Mais de uma unidade ativa: mostra o seletor e o nome da unidade nas telas. */
  multi: boolean;
}

export const getUnitContext = cache(async (tenantId: string, userId: string | null): Promise<UnitContext> => {
  const all = await listUnits(tenantId);
  const user = userId ? await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { unitIds: true } }) : null;
  const allowed = allowedUnits(all, user?.unitIds ?? []);
  const chosen = (await cookies()).get(UNIT_COOKIE)?.value;
  const main = mainUnit(all)!;
  const current = pickUnit(allowed, chosen) ?? main;
  return { all, main, allowed, current, multi: all.filter((u) => u.active).length > 1 };
});
