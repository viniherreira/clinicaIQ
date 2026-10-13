'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@clinicaiq/db';
import { z } from 'zod';
import { capabilityBlocked, writeBlocked } from '@/lib/access';
import { composeAddress } from '@/lib/address';
import { currentAccess } from '@/lib/guard';
import { listUnits } from '@/lib/units';
import { mainUnit } from '@/lib/unit-rules';

/**
 * Unidades da clínica (Configurações → Clínica → Unidades) e em quais delas
 * cada pessoa da equipe trabalha. Regras em `lib/unit-rules.ts`.
 */

type Result = { ok: true; id?: string } | { ok: false; message: string };

const MAX_UNITS = 20;

export interface UnitRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  zipCode: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  /** Horário próprio; nulo = o da clínica. */
  businessHours: { open: boolean; start: string; end: string }[] | null;
  active: boolean;
  main: boolean;
  /** Agendamentos daqui para frente. */
  upcoming: number;
}

async function guard(capability: 'configuracoes' | 'equipe' = 'configuracoes') {
  const acesso = await currentAccess();
  if (!acesso) return { ok: false as const, message: 'Entre de novo.' };
  const bloqueio = (await writeBlocked(acesso.tenantId)) ?? (await capabilityBlocked(acesso.tenantId, capability));
  if (bloqueio) return { ok: false as const, message: bloqueio };
  return { ok: true as const, ...acesso };
}

const HHMM = /^\d{2}:\d{2}$/;
const hoursSchema = z
  .array(z.object({ open: z.boolean(), start: z.string().regex(HHMM), end: z.string().regex(HHMM) }))
  .length(7)
  .refine((d) => d.every((x) => !x.open || x.end > x.start), 'Horário de funcionamento inválido.');

const unitSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, 'Dê um nome à unidade (ex.: Centro).').max(60),
  phone: z.string().trim().max(30).optional().default(''),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido.')]).optional().default(''),
  zipCode: z.string().trim().max(10).optional().default(''),
  street: z.string().trim().max(120).optional().default(''),
  addressNumber: z.string().trim().max(20).optional().default(''),
  complement: z.string().trim().max(60).optional().default(''),
  neighborhood: z.string().trim().max(60).optional().default(''),
  city: z.string().trim().max(60).optional().default(''),
  state: z.string().trim().max(2).optional().default(''),
  businessHours: hoursSchema.nullable().optional().default(null),
  active: z.boolean().default(true),
});

export async function listUnitsForSettings(): Promise<UnitRow[]> {
  const acesso = await currentAccess();
  if (!acesso) return [];
  const units = await listUnits(acesso.tenantId);
  const main = mainUnit(units);
  const futuros = await prisma.appointment.groupBy({
    by: ['unitId'],
    where: { tenantId: acesso.tenantId, startTime: { gte: new Date() }, status: { notIn: ['CANCELLED', 'MISSED'] } },
    _count: { _all: true },
  });
  const conta = (id: string) =>
    futuros.filter((f) => (f.unitId ?? main?.id) === id).reduce((n, f) => n + f._count._all, 0);
  return units.map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    zipCode: u.zipCode,
    street: u.street,
    addressNumber: u.addressNumber,
    complement: u.complement,
    neighborhood: u.neighborhood,
    city: u.city,
    state: u.state,
    address: u.address,
    businessHours: Array.isArray(u.businessHours) ? (u.businessHours as UnitRow['businessHours']) : null,
    active: u.active,
    main: u.id === main?.id,
    upcoming: conta(u.id),
  }));
}

export async function saveUnit(input: z.input<typeof unitSchema>): Promise<Result> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;

  const units = await listUnits(g.tenantId);
  const main = mainUnit(units);
  if (units.some((u) => u.id !== d.id && u.name.toLowerCase() === d.name.toLowerCase())) {
    return { ok: false, message: 'Já existe uma unidade com esse nome.' };
  }
  if (d.id && d.id === main?.id && !d.active) return { ok: false, message: 'A unidade principal não pode ser desativada.' };

  const data = {
    name: d.name,
    phone: d.phone || null,
    email: d.email || null,
    zipCode: d.zipCode || null,
    street: d.street || null,
    addressNumber: d.addressNumber || null,
    complement: d.complement || null,
    neighborhood: d.neighborhood || null,
    city: d.city || null,
    state: d.state ? d.state.toUpperCase() : null,
    address: composeAddress({ ...d, state: d.state ? d.state.toUpperCase() : null }),
    businessHours: d.businessHours ? (d.businessHours as Prisma.InputJsonValue) : Prisma.DbNull,
    active: d.active,
  };

  let id: string | undefined = d.id;
  if (d.id) {
    if (!units.some((u) => u.id === d.id)) return { ok: false, message: 'Unidade não encontrada.' };
    await prisma.clinicUnit.update({ where: { id: d.id }, data });
  } else {
    if (units.length >= MAX_UNITS) return { ok: false, message: `Limite de ${MAX_UNITS} unidades.` };
    const order = Math.max(0, ...units.map((u) => u.order)) + 1;
    const nova = await prisma.clinicUnit.create({ data: { tenantId: g.tenantId, ...data, order } });
    id = nova.id;
  }

  await prisma.auditLog.create({
    data: { tenantId: g.tenantId, userId: g.userId, action: d.id ? 'UPDATE' : 'CREATE', entity: 'ClinicUnit', entityId: id ?? '' },
  });
  revalidatePath('/', 'layout');
  return { ok: true, id };
}

/** Em quais unidades a pessoa trabalha. Vazio = todas. */
export async function setUserUnits(userId: string, unitIds: string[]): Promise<Result> {
  const g = await guard('equipe');
  if (!g.ok) return g;
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId: g.tenantId }, select: { id: true } });
  if (!user) return { ok: false, message: 'Pessoa não encontrada.' };
  const ids = [...new Set(unitIds)];
  if (ids.length && (await prisma.clinicUnit.count({ where: { tenantId: g.tenantId, id: { in: ids } } })) !== ids.length) {
    return { ok: false, message: 'Unidade não encontrada.' };
  }
  await prisma.user.update({ where: { id: userId }, data: { unitIds: ids } });
  revalidatePath('/', 'layout');
  return { ok: true };
}
