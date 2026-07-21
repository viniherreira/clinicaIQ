'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, decrypt } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { addDays } from 'date-fns';

// ─── Auth ──────────────────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** BRL-masked string → number (cents-based). */
function parseBRL(value: string | number): number {
  if (typeof value === 'number') return value;
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

async function nextQuoteNumber(tenantId: string): Promise<number> {
  const last = await prisma.quote.findFirst({
    where: { tenantId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Computes per-item and quote totals from raw items + global discount. */
function computeTotals(
  items: { unitPrice: number; quantity: number; discountPercent: number }[],
  discountType: 'PERCENT' | 'FIXED',
  discountValue: number,
) {
  const lines = items.map((it) => {
    const gross = it.unitPrice * it.quantity;
    const net = gross * (1 - (it.discountPercent || 0) / 100);
    return round2(net);
  });
  const subtotal = round2(lines.reduce((s, n) => s + n, 0));
  const discountAmount =
    discountType === 'PERCENT' ? round2((subtotal * (discountValue || 0)) / 100) : round2(discountValue || 0);
  const total = round2(Math.max(0, subtotal - discountAmount));
  return { lines, subtotal, discountAmount, total };
}

// ─── List ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export async function listQuotes({
  search = '',
  status,
  page = 1,
}: {
  search?: string;
  status?: string;
  page?: number;
}) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(search ? { patient: { name: { contains: search, mode: 'insensitive' as const } } } : {}),
  };

  const [quotes, total] = await Promise.all([
    db.quote.findMany({
      where,
      orderBy: { number: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        validUntil: true,
        createdAt: true,
        patient: { select: { name: true } },
        _count: { select: { items: true } },
        payments: { select: { amount: true } },
      },
    }),
    db.quote.count({ where }),
  ]);

  return {
    quotes: quotes.map((q) => ({
      ...q,
      total: Number(q.total),
      paid: q.payments.reduce((s, p) => s + Number(p.amount), 0),
      payments: undefined,
    })),
    total,
    pages: Math.ceil(total / PAGE_SIZE),
  };
}

// ─── Read single (internal) ──────────────────────────────────────────────────

export async function getQuote(id: string) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, name: true, controlNumber: true } },
      items: { orderBy: { id: 'asc' } },
      payments: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!quote) return null;
  return {
    ...quote,
    discountValue: Number(quote.discountValue),
    subtotal: Number(quote.subtotal),
    total: Number(quote.total),
    items: quote.items.map((it) => ({
      ...it,
      unitPrice: Number(it.unitPrice),
      discountPercent: Number(it.discountPercent ?? 0),
      total: Number(it.total),
    })),
    payments: quote.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      notes: p.notes,
      paidAt: p.paidAt,
    })),
  };
}

// ─── Patient / procedure pickers ───────────────────────────────────────────────

export async function searchQuotePatients(query: string) {
  const { tenantId } = await requireTenant();
  // Tokenized match — same behavior as the agenda search (full names work).
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];
  const db = getTenantClient(tenantId);
  const patients = await db.patient.findMany({
    where: {
      deletedAt: null,
      active: true,
      AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })),
    },
    select: { id: true, name: true, controlNumber: true },
    take: 10,
    orderBy: { name: 'asc' },
  });
  return patients;
}

export async function listQuoteProcedures() {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const procedures = await db.procedure.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, basePrice: true, allowsDiscount: true, maxDiscountPercent: true },
  });
  return procedures.map((p) => ({
    ...p,
    basePrice: Number(p.basePrice),
    maxDiscountPercent: p.maxDiscountPercent != null ? Number(p.maxDiscountPercent) : null,
  }));
}

// ─── Create / update ──────────────────────────────────────────────────────────

const itemSchema = z.object({
  procedureId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  unitPrice: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(1).max(999),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
});

const quoteSchema = z.object({
  patientId: z.string().min(1, 'Selecione um paciente'),
  discountType: z.enum(['PERCENT', 'FIXED']).default('PERCENT'),
  discountValue: z.coerce.number().min(0).default(0),
  validUntil: z.string().min(1),
  notes: z.string().max(2000).optional().or(z.literal('')),
  internalNotes: z.string().max(2000).optional().or(z.literal('')),
  items: z.array(itemSchema).min(1, 'Adicione ao menos um item'),
});

export type QuoteFormState =
  | { success: true; quoteId: string }
  | { success: false; errors: Record<string, string[]>; message?: string };

function parseQuoteForm(formData: FormData) {
  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get('items') ?? '[]'));
  } catch {
    items = [];
  }
  return quoteSchema.safeParse({
    patientId: formData.get('patientId'),
    discountType: formData.get('discountType') || 'PERCENT',
    discountValue: parseBRL(String(formData.get('discountValue') ?? '0')),
    validUntil: formData.get('validUntil'),
    notes: formData.get('notes') || '',
    internalNotes: formData.get('internalNotes') || '',
    items,
  });
}

export async function createQuote(
  _prev: QuoteFormState | null,
  formData: FormData,
): Promise<QuoteFormState> {
  const { tenantId, userId } = await requireTenant();
  const parsed = parseQuoteForm(formData);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const { subtotal, total, lines } = computeTotals(data.items, data.discountType, data.discountValue);

  const number = await nextQuoteNumber(tenantId);
  const quote = await prisma.quote.create({
    data: {
      tenantId,
      patientId: data.patientId,
      number,
      status: 'DRAFT',
      discountType: data.discountType,
      discountValue: data.discountValue,
      subtotal,
      total,
      validUntil: new Date(data.validUntil),
      notes: data.notes || null,
      internalNotes: data.internalNotes || null,
      createdById: userId,
      updatedById: userId,
      items: {
        create: data.items.map((it, i) => ({
          procedureId: it.procedureId || null,
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          discountPercent: it.discountPercent,
          total: lines[i],
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'CREATE', entity: 'Quote', entityId: quote.id },
  });

  revalidatePath('/orcamentos');
  return { success: true, quoteId: quote.id };
}

export async function updateQuote(
  id: string,
  _prev: QuoteFormState | null,
  formData: FormData,
): Promise<QuoteFormState> {
  const { tenantId, userId } = await requireTenant();
  const existing = await prisma.quote.findFirst({ where: { id, tenantId }, select: { status: true } });
  if (!existing) return { success: false, errors: {}, message: 'Orçamento não encontrado' };
  if (existing.status !== 'DRAFT') {
    return { success: false, errors: {}, message: 'Só é possível editar orçamentos em rascunho' };
  }

  const parsed = parseQuoteForm(formData);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const { subtotal, total, lines } = computeTotals(data.items, data.discountType, data.discountValue);

  await prisma.$transaction([
    prisma.quoteItem.deleteMany({ where: { quoteId: id } }),
    prisma.quote.update({
      where: { id, tenantId },
      data: {
        patientId: data.patientId,
        discountType: data.discountType,
        discountValue: data.discountValue,
        subtotal,
        total,
        validUntil: new Date(data.validUntil),
        notes: data.notes || null,
        internalNotes: data.internalNotes || null,
        updatedById: userId,
        items: {
          create: data.items.map((it, i) => ({
            procedureId: it.procedureId || null,
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            discountPercent: it.discountPercent,
            total: lines[i],
          })),
        },
      },
    }),
  ]);

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE', entity: 'Quote', entityId: id },
  });

  revalidatePath('/orcamentos');
  revalidatePath(`/orcamentos/${id}`);
  return { success: true, quoteId: id };
}

// ─── Status actions ────────────────────────────────────────────────────────────

export async function sendQuote(id: string): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireTenant();
  const quote = await prisma.quote.findFirst({ where: { id, tenantId }, select: { status: true } });
  if (!quote) return { ok: false, message: 'Orçamento não encontrado' };

  await prisma.quote.update({
    where: { id, tenantId },
    data: { status: 'SENT', sentAt: new Date(), updatedById: userId },
  });

  // Best-effort WhatsApp dispatch (mock in dev).
  try {
    const { dispatchQuoteMessage } = await import('@/lib/whatsapp');
    await dispatchQuoteMessage(id);
  } catch {}

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'SEND', entity: 'Quote', entityId: id },
  });

  revalidatePath('/orcamentos');
  revalidatePath(`/orcamentos/${id}`);
  return { ok: true };
}

/** Transitions a DRAFT quote to SENT (no message dispatch) — used when the
 *  clinic shares the public link/PDF manually instead of sending via WhatsApp. */
export async function markQuoteSent(id: string): Promise<{ ok: boolean }> {
  const { tenantId, userId } = await requireTenant();
  const quote = await prisma.quote.findFirst({ where: { id, tenantId }, select: { status: true } });
  if (!quote) return { ok: false };
  if (quote.status !== 'DRAFT') return { ok: true };

  await prisma.quote.update({
    where: { id, tenantId },
    data: { status: 'SENT', sentAt: new Date(), updatedById: userId },
  });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'MARK_SENT', entity: 'Quote', entityId: id },
  });
  revalidatePath('/orcamentos');
  revalidatePath(`/orcamentos/${id}`);
  return { ok: true };
}

// ─── Pagamentos do orçamento ───────────────────────────────────────────────────

const quotePaymentSchema = z.object({
  amount: z.string().transform(parseBRL).refine((v) => v > 0, { message: 'Valor obrigatório' }),
  method: z.string().trim().max(40).optional().or(z.literal('')),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

export type QuotePaymentState =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

export async function addQuotePayment(
  quoteId: string,
  _prev: QuotePaymentState | null,
  formData: FormData,
): Promise<QuotePaymentState> {
  const { tenantId, userId } = await requireTenant();
  const parsed = quotePaymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    select: { id: true, patientId: true },
  });
  if (!quote) return { success: false, errors: { amount: ['Orçamento não encontrado'] } };

  const payment = await prisma.payment.create({
    data: {
      tenantId,
      patientId: quote.patientId,
      quoteId: quote.id,
      amount: parsed.data.amount,
      method: parsed.data.method || null,
      notes: parsed.data.notes || null,
      createdById: userId,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'CREATE', entity: 'Payment', entityId: payment.id },
  });

  revalidatePath(`/orcamentos/${quoteId}`);
  revalidatePath('/orcamentos');
  revalidatePath(`/pacientes/${quote.patientId}`);
  return { success: true };
}

export async function deleteQuotePayment(paymentId: string, quoteId: string) {
  const { tenantId, userId } = await requireTenant();
  await prisma.payment.deleteMany({ where: { id: paymentId, tenantId } });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'Payment', entityId: paymentId },
  });
  revalidatePath(`/orcamentos/${quoteId}`);
  revalidatePath('/orcamentos');
}

/** Clinic-side approval: marks the quote ACCEPTED so it counts in the financial
 *  totals (contratado / a receber) and the dashboard. */
export async function acceptQuote(id: string): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireTenant();
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    select: { status: true, patientId: true },
  });
  if (!quote) return { ok: false, message: 'Orçamento não encontrado' };

  await prisma.quote.update({
    where: { id, tenantId },
    data: { status: 'ACCEPTED', acceptedAt: new Date(), rejectedAt: null, rejectReason: null, updatedById: userId },
  });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'ACCEPT', entity: 'Quote', entityId: id },
  });

  revalidatePath('/orcamentos');
  revalidatePath(`/orcamentos/${id}`);
  revalidatePath('/financeiro');
  revalidatePath('/dashboard');
  revalidatePath(`/pacientes/${quote.patientId}`);
  return { ok: true };
}

/** Undo an approval — sends the quote back to DRAFT so it drops out of the
 *  financial totals and can be edited again. */
export async function reopenQuote(id: string): Promise<{ ok: boolean }> {
  const { tenantId, userId } = await requireTenant();
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    select: { patientId: true },
  });
  if (!quote) return { ok: false };

  await prisma.quote.update({
    where: { id, tenantId },
    data: { status: 'DRAFT', acceptedAt: null, updatedById: userId },
  });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'REOPEN', entity: 'Quote', entityId: id },
  });

  revalidatePath('/orcamentos');
  revalidatePath(`/orcamentos/${id}`);
  revalidatePath('/financeiro');
  revalidatePath('/dashboard');
  revalidatePath(`/pacientes/${quote.patientId}`);
  return { ok: true };
}

export async function deleteQuote(id: string) {
  const { tenantId, userId } = await requireTenant();
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    select: { patientId: true },
  });
  if (!quote) return;

  // Payments reference the quote with SetNull, so a bare delete would leave them
  // orphaned and still counted in the financial totals. Remove them together.
  await prisma.$transaction([
    prisma.payment.deleteMany({ where: { quoteId: id, tenantId } }),
    prisma.quote.delete({ where: { id, tenantId } }),
  ]);
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'Quote', entityId: id },
  });

  revalidatePath('/orcamentos');
  revalidatePath('/financeiro');
  revalidatePath('/dashboard');
  revalidatePath(`/pacientes/${quote.patientId}`);
}

// ─── PDF data ──────────────────────────────────────────────────────────────────

function getMasterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

export async function getQuotePdfData(id: string) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      items: { orderBy: { id: 'asc' } },
      patient: { select: { name: true, phoneEncrypted: true, email: true } },
      tenant: { select: { name: true, phone: true, email: true, address: true } },
    },
  });
  if (!quote) return null;

  let phone = '';
  try {
    phone = quote.patient.phoneEncrypted ? decrypt(quote.patient.phoneEncrypted, getMasterKey(), tenantId) : '';
  } catch {
    phone = '';
  }

  const discountLabel =
    quote.discountType === 'PERCENT'
      ? `${Number(quote.discountValue)}%`
      : `R$ ${Number(quote.discountValue).toFixed(2)}`;

  return {
    clinic: {
      name: quote.tenant.name,
      address: quote.tenant.address ?? undefined,
      phone: quote.tenant.phone ?? undefined,
      email: quote.tenant.email ?? undefined,
    },
    patient: {
      name: quote.patient.name,
      phone: phone || undefined,
      email: quote.patient.email ?? undefined,
    },
    quote: {
      id: quote.id,
      number: quote.number,
      items: quote.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        discountPercent: Number(it.discountPercent ?? 0),
        total: Number(it.total),
      })),
      subtotal: Number(quote.subtotal),
      discountLabel,
      total: Number(quote.total),
      validUntil: quote.validUntil.toLocaleDateString('pt-BR'),
      createdAt: quote.createdAt.toLocaleDateString('pt-BR'),
      notes: quote.notes ?? undefined,
    },
  };
}

const DEFAULT_VALID_DAYS = 30;
export async function defaultValidUntil(): Promise<string> {
  return addDays(new Date(), DEFAULT_VALID_DAYS).toISOString().slice(0, 10);
}
