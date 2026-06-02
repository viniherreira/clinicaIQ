'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');

  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, tenantId: tenant.id },
    select: { id: true },
  });

  return { tenantId: tenant.id, userId: user!.id };
}

/** Parses a BRL-masked string ("1.234,56" or "123456") into a Number. The mask
 *  is cents-based, so all digits are taken and the last two are the cents. */
function parseBRL(value: string): number {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Estética Facial', color: '#EC4899' },
  { name: 'Estética Corporal', color: '#8B5CF6' },
  { name: 'Odontologia Clínica', color: '#3B82F6' },
  { name: 'Odontologia Estética', color: '#06B6D4' },
  { name: 'Cirurgia', color: '#EF4444' },
  { name: 'Outros', color: '#64748B' },
];

/** Seeds the default categories the first time a tenant has none. Safe to call
 *  on every list — only writes when the tenant has zero categories. */
async function ensureDefaultCategories(tenantId: string) {
  const count = await prisma.procedureCategory.count({ where: { tenantId } });
  if (count > 0) return;
  await prisma.procedureCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, tenantId, isDefault: true })),
    skipDuplicates: true,
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProcedureFormState =
  | { success: true; procedureId: string }
  | { success: false; errors: Record<string, string[]>; message?: string };

export type CategoryFormState =
  | { success: true; categoryId: string }
  | { success: false; errors: Record<string, string[]> };

// ─── Schemas ─────────────────────────────────────────────────────────────────

const procedureSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(120),
  categoryId: z.string().optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  basePrice: z
    .string()
    .transform(parseBRL)
    .refine((v) => v > 0, { message: 'Valor deve ser maior que zero' }),
  durationMinutes: z.coerce.number().int().min(1, 'Duração obrigatória').max(1440),
  prepTimeMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  color: z.string().max(9).optional().or(z.literal('')),
  internalCode: z.string().max(40).optional().or(z.literal('')),
  materials: z.string().max(1000).optional().or(z.literal('')),
  allowsDiscount: z.coerce.boolean().optional(),
  maxDiscountPercent: z.coerce.number().min(0).max(100).optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(60),
  color: z.string().max(9).optional().or(z.literal('')),
});

// ─── List ────────────────────────────────────────────────────────────────────

export type ProcedureSort = 'name' | 'basePrice' | 'durationMinutes';

export async function listProcedures({
  search = '',
  categoryId,
  active,
  sort = 'name',
  dir = 'asc',
  page = 1,
}: {
  search?: string;
  categoryId?: string;
  active?: boolean;
  sort?: ProcedureSort;
  dir?: 'asc' | 'desc';
  page?: number;
}) {
  const { tenantId } = await requireTenant();
  await ensureDefaultCategories(tenantId);

  const db = getTenantClient(tenantId);
  const PAGE_SIZE = 20;

  const where = {
    deletedAt: null,
    ...(active !== undefined ? { active } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [procedures, total, categories] = await Promise.all([
    db.procedure.findMany({
      where,
      orderBy: { [sort]: dir },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        color: true,
        basePrice: true,
        durationMinutes: true,
        active: true,
        category: { select: { id: true, name: true, color: true } },
      },
    }),
    db.procedure.count({ where }),
    db.procedureCategory.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        isDefault: true,
        _count: { select: { procedures: true } },
      },
    }),
  ]);

  return {
    procedures: procedures.map((p) => ({ ...p, basePrice: Number(p.basePrice) })),
    total,
    pages: Math.ceil(total / PAGE_SIZE),
    categories,
  };
}

// ─── Get single ──────────────────────────────────────────────────────────────

export async function getProcedure(id: string) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const procedure = await db.procedure.findUnique({
    where: { id },
    include: {
      professionals: { select: { id: true } },
      _count: { select: { appointments: true, quoteItems: true } },
    },
  });

  if (!procedure || procedure.deletedAt) return null;

  return {
    ...procedure,
    basePrice: Number(procedure.basePrice),
    maxDiscountPercent:
      procedure.maxDiscountPercent != null ? Number(procedure.maxDiscountPercent) : null,
    professionalIds: procedure.professionals.map((p) => p.id),
  };
}

// ─── Form data parsing ─────────────────────────────────────────────────────────

function parseProcedureForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const professionalIds = formData
    .getAll('professionalIds')
    .map((v) => String(v))
    .filter(Boolean);
  return { parsed: procedureSchema.safeParse(raw), professionalIds };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createProcedure(
  _prev: ProcedureFormState | null,
  formData: FormData,
): Promise<ProcedureFormState> {
  const { tenantId, userId } = await requireTenant();
  const { parsed, professionalIds } = parseProcedureForm(formData);

  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const duplicate = await prisma.procedure.findFirst({
    where: { tenantId, name: data.name, deletedAt: null },
    select: { id: true },
  });
  if (duplicate) {
    return { success: false, errors: { name: ['Já existe um procedimento com este nome'] } };
  }

  const procedure = await prisma.procedure.create({
    data: {
      tenantId,
      name: data.name,
      categoryId: data.categoryId || null,
      description: data.description || null,
      basePrice: data.basePrice,
      durationMinutes: data.durationMinutes,
      prepTimeMinutes: data.prepTimeMinutes ?? null,
      color: data.color || null,
      internalCode: data.internalCode || null,
      materials: data.materials || null,
      allowsDiscount: data.allowsDiscount ?? false,
      maxDiscountPercent: data.allowsDiscount ? (data.maxDiscountPercent ?? null) : null,
      createdById: userId,
      updatedById: userId,
      professionals: professionalIds.length
        ? { connect: professionalIds.map((id) => ({ id })) }
        : undefined,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'CREATE', entity: 'Procedure', entityId: procedure.id },
  });

  revalidatePath('/procedimentos');
  return { success: true, procedureId: procedure.id };
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateProcedure(
  id: string,
  _prev: ProcedureFormState | null,
  formData: FormData,
): Promise<ProcedureFormState> {
  const { tenantId, userId } = await requireTenant();
  const { parsed, professionalIds } = parseProcedureForm(formData);

  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const duplicate = await prisma.procedure.findFirst({
    where: { tenantId, name: data.name, deletedAt: null, NOT: { id } },
    select: { id: true },
  });
  if (duplicate) {
    return { success: false, errors: { name: ['Já existe um procedimento com este nome'] } };
  }

  await prisma.procedure.update({
    where: { id, tenantId },
    data: {
      name: data.name,
      categoryId: data.categoryId || null,
      description: data.description || null,
      basePrice: data.basePrice,
      durationMinutes: data.durationMinutes,
      prepTimeMinutes: data.prepTimeMinutes ?? null,
      color: data.color || null,
      internalCode: data.internalCode || null,
      materials: data.materials || null,
      allowsDiscount: data.allowsDiscount ?? false,
      maxDiscountPercent: data.allowsDiscount ? (data.maxDiscountPercent ?? null) : null,
      updatedById: userId,
      professionals: { set: professionalIds.map((pid) => ({ id: pid })) },
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE', entity: 'Procedure', entityId: id },
  });

  revalidatePath('/procedimentos');
  return { success: true, procedureId: id };
}

// ─── Toggle active ─────────────────────────────────────────────────────────────

export async function toggleProcedureActive(id: string) {
  const { tenantId, userId } = await requireTenant();

  const procedure = await prisma.procedure.findFirst({ where: { id, tenantId } });
  if (!procedure) return;

  await prisma.procedure.update({
    where: { id, tenantId },
    data: { active: !procedure.active, updatedById: userId },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: procedure.active ? 'DEACTIVATE' : 'ACTIVATE',
      entity: 'Procedure',
      entityId: id,
    },
  });

  revalidatePath('/procedimentos');
}

// ─── Soft delete ────────────────────────────────────────────────────────────────

export async function deleteProcedure(id: string) {
  const { tenantId, userId } = await requireTenant();

  await prisma.procedure.update({
    where: { id, tenantId },
    data: { deletedAt: new Date(), active: false, updatedById: userId },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'Procedure', entityId: id },
  });

  revalidatePath('/procedimentos');
}

// ─── Duplicate ──────────────────────────────────────────────────────────────────

export async function duplicateProcedure(id: string): Promise<ProcedureFormState> {
  const { tenantId, userId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const source = await db.procedure.findUnique({
    where: { id },
    include: { professionals: { select: { id: true } } },
  });
  if (!source || source.deletedAt) {
    return { success: false, errors: { name: ['Procedimento não encontrado'] } };
  }

  // Find an available "(cópia)" name.
  let name = `${source.name} (cópia)`;
  let n = 2;
  while (await prisma.procedure.findFirst({ where: { tenantId, name, deletedAt: null }, select: { id: true } })) {
    name = `${source.name} (cópia ${n++})`;
  }

  const copy = await prisma.procedure.create({
    data: {
      tenantId,
      name,
      categoryId: source.categoryId,
      description: source.description,
      basePrice: source.basePrice,
      durationMinutes: source.durationMinutes,
      prepTimeMinutes: source.prepTimeMinutes,
      color: source.color,
      internalCode: source.internalCode,
      materials: source.materials,
      allowsDiscount: source.allowsDiscount,
      maxDiscountPercent: source.maxDiscountPercent,
      createdById: userId,
      updatedById: userId,
      professionals: { connect: source.professionals.map((p) => ({ id: p.id })) },
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DUPLICATE', entity: 'Procedure', entityId: copy.id },
  });

  revalidatePath('/procedimentos');
  return { success: true, procedureId: copy.id };
}

// ─── Professionals (for multi-select) ────────────────────────────────────────────

export async function listProfessionals() {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  return db.professional.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, specialty: true },
  });
}

// ─── Categories ──────────────────────────────────────────────────────────────────

export async function listCategories() {
  const { tenantId } = await requireTenant();
  await ensureDefaultCategories(tenantId);
  const db = getTenantClient(tenantId);
  return db.procedureCategory.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      isDefault: true,
      _count: { select: { procedures: true } },
    },
  });
}

export async function createCategory(
  _prev: CategoryFormState | null,
  formData: FormData,
): Promise<CategoryFormState> {
  const { tenantId } = await requireTenant();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.procedureCategory.findFirst({
    where: { tenantId, name: parsed.data.name },
    select: { id: true },
  });
  if (existing) {
    return { success: false, errors: { name: ['Já existe uma categoria com este nome'] } };
  }

  const category = await prisma.procedureCategory.create({
    data: { tenantId, name: parsed.data.name, color: parsed.data.color || null },
  });

  revalidatePath('/procedimentos');
  return { success: true, categoryId: category.id };
}

export async function updateCategory(id: string, name: string, color?: string) {
  const { tenantId } = await requireTenant();
  const trimmed = name.trim();
  if (trimmed.length < 2) return;

  const clash = await prisma.procedureCategory.findFirst({
    where: { tenantId, name: trimmed, NOT: { id } },
    select: { id: true },
  });
  if (clash) return;

  await prisma.procedureCategory.update({
    where: { id, tenantId },
    data: { name: trimmed, color: color || null },
  });
  revalidatePath('/procedimentos');
}

export async function deleteCategory(id: string) {
  const { tenantId } = await requireTenant();

  // Detach procedures from the category before removing it (categoryId is optional).
  await prisma.procedure.updateMany({
    where: { tenantId, categoryId: id },
    data: { categoryId: null },
  });
  await prisma.procedureCategory.delete({ where: { id, tenantId } });
  revalidatePath('/procedimentos');
}
