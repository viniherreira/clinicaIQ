'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import type { ContractDocumentProps, QuoteDocumentProps } from '@clinicaiq/pdf';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import { addDays } from 'date-fns';
import { capabilityToken } from '@/lib/tokens';
import { capabilityBlocked, writeBlocked } from '@/lib/access';
import { refOutsideTenant, refErrorMessage } from '@/lib/owns';
import { notifyCrm } from '@/crm/notify';
import { describePayment, isPaymentMethod, MAX_INSTALLMENTS } from '@/lib/payment-terms';
import { loadClinicInfo, loadPatientDocData } from '@/lib/documents';
import {
  contractGaps,
  contractTitle,
  DEFAULT_QUOTE_TERMS,
  isMinor,
  maritalStatusText,
  type DocumentGap,
} from '@/lib/document-content';
import { valorPorExtenso } from '@/lib/extenso';
import { clinicToday, instantDateBR, instantDateLongBR, instantDateTimeBR, wallDateBR } from '@/lib/tz';

// ─── Auth ──────────────────────────────────────────────────────────────────────

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId, active: true } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');
  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, tenantId: tenant.id, active: true },
    select: { id: true },
  });
  if (!user) redirect('/sign-in');

  return { tenantId: tenant.id, userId: user.id };
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

  const [quotes, total, valueAgg, paidAgg, acceptedCount] = await Promise.all([
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
        patient: { select: { id: true, name: true } },
        _count: { select: { items: true } },
        payments: { select: { amount: true } },
      },
    }),
    db.quote.count({ where }),
    // Totals below cover the whole filtered set, not just the current page.
    db.quote.aggregate({ where, _sum: { total: true } }),
    db.payment.aggregate({ where: { quote: where }, _sum: { amount: true } }),
    db.quote.count({ where: { ...where, status: 'ACCEPTED' } }),
  ]);

  const totalValue = Number(valueAgg._sum.total ?? 0);
  const totalPaid = Number(paidAgg._sum.amount ?? 0);

  return {
    quotes: quotes.map((q) => ({
      ...q,
      total: Number(q.total),
      paid: q.payments.reduce((s, p) => s + Number(p.amount), 0),
      payments: undefined,
    })),
    total,
    pages: Math.ceil(total / PAGE_SIZE),
    totals: {
      value: totalValue,
      paid: totalPaid,
      pending: Math.max(0, totalValue - totalPaid),
      accepted: acceptedCount,
    },
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
      professional: { select: { id: true, name: true, registration: true } },
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
    downPayment: Number(quote.downPayment),
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

/** Quem pode ser o responsável pelo tratamento: profissionais ativos. */
export async function listQuoteProfessionals() {
  const { tenantId } = await requireTenant();
  return prisma.professional.findMany({
    where: { tenantId, active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, registration: true },
  });
}

/** Pre-selects a patient when the quote is started from the agenda or a record. */
export async function getQuotePatient(patientId: string) {
  const { tenantId } = await requireTenant();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true, name: true, controlNumber: true },
  });
  return patient;
}

// ─── Create / update ──────────────────────────────────────────────────────────

const itemSchema = z.object({
  procedureId: z.string().nullable().optional(),
  name: z.string().trim().min(1, 'Dê um nome a cada item').max(160),
  /** Dente, região ou detalhe do item. */
  description: z.string().trim().max(160).optional().or(z.literal('')),
  unitPrice: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(1).max(999),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
});

const quoteSchema = z.object({
  patientId: z.string().min(1, 'Selecione um paciente'),
  professionalId: z.string().max(60).optional().or(z.literal('')),
  discountType: z.enum(['PERCENT', 'FIXED']).default('PERCENT'),
  discountValue: z.coerce.number().min(0).default(0),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de validade inválida'),
  paymentMethod: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || isPaymentMethod(v), 'Forma de pagamento inválida'),
  downPayment: z.coerce.number().min(0).default(0),
  installments: z.coerce.number().int().min(1).max(MAX_INSTALLMENTS).default(1),
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
    professionalId: formData.get('professionalId') || '',
    discountType: formData.get('discountType') || 'PERCENT',
    discountValue: parseBRL(String(formData.get('discountValue') ?? '0')),
    validUntil: formData.get('validUntil'),
    paymentMethod: formData.get('paymentMethod') || '',
    downPayment: Number(formData.get('downPayment') ?? 0) || 0,
    installments: formData.get('installments') || 1,
    notes: formData.get('notes') || '',
    internalNotes: formData.get('internalNotes') || '',
    items,
  });
}

/**
 * Entrada maior que o total não é erro de digitação inofensivo: o contrato
 * sairia dizendo que o paciente paga de entrada mais do que deve. Melhor
 * recusar com a frase certa do que imprimir isso.
 */
function paymentError(downPayment: number, total: number): string | null {
  if (downPayment > total + 0.004) return 'A entrada não pode ser maior que o total do orçamento.';
  return null;
}

/** Campos de pagamento e responsável, iguais na criação e na edição. */
function termsData(data: z.infer<typeof quoteSchema>) {
  return {
    professionalId: data.professionalId || null,
    paymentMethod: data.paymentMethod || null,
    downPayment: Math.round(data.downPayment * 100) / 100,
    installments: data.installments,
  };
}

export async function createQuote(
  _prev: QuoteFormState | null,
  formData: FormData,
): Promise<QuoteFormState> {
  const { tenantId, userId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: {}, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return { success: false, errors: {}, message: semAcesso };
  const parsed = parseQuoteForm(formData);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;
  const { subtotal, total, lines } = computeTotals(data.items, data.discountType, data.discountValue);

  const pagamento = paymentError(data.downPayment, total);
  if (pagamento) return { success: false, errors: { downPayment: [pagamento] }, message: pagamento };

  const foreign = await refOutsideTenant(tenantId, {
    patientId: data.patientId,
    professionalId: data.professionalId || null,
    procedureIds: data.items.map((it) => it.procedureId),
  });
  if (foreign) return { success: false, errors: {}, message: refErrorMessage(foreign) };

  const number = await nextQuoteNumber(tenantId);
  const quote = await prisma.quote.create({
    data: {
      tenantId,
      patientId: data.patientId,
      number,
      status: 'DRAFT',
      // O link do orçamento é a credencial: 256 bits do CSPRNG, não um cuid.
      publicToken: capabilityToken(),
      discountType: data.discountType,
      discountValue: data.discountValue,
      subtotal,
      total,
      validUntil: new Date(data.validUntil),
      ...termsData(data),
      notes: data.notes || null,
      internalNotes: data.internalNotes || null,
      createdById: userId,
      updatedById: userId,
      items: {
        create: data.items.map((it, i) => ({
          procedureId: it.procedureId || null,
          name: it.name,
          description: it.description || null,
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
  after(() => notifyCrm(tenantId, { type: 'quote.created', patientId: data.patientId, quoteId: quote.id }));

  revalidatePath('/orcamentos');
  return { success: true, quoteId: quote.id };
}

export async function updateQuote(
  id: string,
  _prev: QuoteFormState | null,
  formData: FormData,
): Promise<QuoteFormState> {
  const { tenantId, userId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: {}, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return { success: false, errors: {}, message: semAcesso };
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

  const pagamento = paymentError(data.downPayment, total);
  if (pagamento) return { success: false, errors: { downPayment: [pagamento] }, message: pagamento };

  const foreign = await refOutsideTenant(tenantId, {
    patientId: data.patientId,
    professionalId: data.professionalId || null,
    procedureIds: data.items.map((it) => it.procedureId),
  });
  if (foreign) return { success: false, errors: {}, message: refErrorMessage(foreign) };

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
        ...termsData(data),
        notes: data.notes || null,
        internalNotes: data.internalNotes || null,
        updatedById: userId,
        items: {
          create: data.items.map((it, i) => ({
            procedureId: it.procedureId || null,
            name: it.name,
            description: it.description || null,
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return { ok: false, message: semAcesso };
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false };

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return { ok: false };
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: { amount: [bloqueio] } };

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return { success: false, errors: { amount: [semAcesso] } };
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return;

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return;
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return { ok: false, message: semAcesso };
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
  after(() => notifyCrm(tenantId, { type: 'quote.accepted', patientId: quote.patientId, quoteId: id }));

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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false };

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return { ok: false };
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
  after(() => notifyCrm(tenantId, { type: 'quote.reopened', patientId: quote.patientId, quoteId: id }));

  revalidatePath('/orcamentos');
  revalidatePath(`/orcamentos/${id}`);
  revalidatePath('/financeiro');
  revalidatePath('/dashboard');
  revalidatePath(`/pacientes/${quote.patientId}`);
  return { ok: true };
}

export async function deleteQuote(id: string) {
  const { tenantId, userId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return;

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return;
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
  after(() => notifyCrm(tenantId, { type: 'quote.deleted', patientId: quote.patientId, quoteId: id }));

  revalidatePath('/orcamentos');
  revalidatePath('/financeiro');
  revalidatePath('/dashboard');
  revalidatePath(`/pacientes/${quote.patientId}`);
}

// ─── Documentos (PDF) ──────────────────────────────────────────────────────────

const pad4 = (n: number) => String(n).padStart(4, '0');

/**
 * O orçamento com tudo o que os documentos precisam. Exige o perfil financeiro:
 * o PDF leva CPF e valores, e a rota que o serve é um GET que qualquer pessoa
 * logada na clínica consegue abrir pela barra de endereço.
 */
async function loadQuoteForDocument(id: string) {
  const { tenantId } = await requireTenant();
  if (await capabilityBlocked(tenantId, 'financeiro')) return null;

  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    include: {
      items: { orderBy: { id: 'asc' } },
      professional: { select: { name: true, registration: true } },
    },
  });
  if (!quote) return null;

  const [clinic, patient, terms] = await Promise.all([
    loadClinicInfo(tenantId),
    loadPatientDocData(quote.patientId, tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { quoteTerms: true, contractTerms: true } }),
  ]);
  if (!patient) return null;

  const subtotal = Number(quote.subtotal);
  const total = Number(quote.total);
  const discountValue = Number(quote.discountValue);

  return {
    tenantId,
    quote,
    clinic,
    patient,
    terms,
    professional: quote.professional
      ? { name: quote.professional.name, registration: quote.professional.registration ?? undefined }
      : undefined,
    items: quote.items.map((it) => ({
      name: it.name,
      description: it.description ?? undefined,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      discountPercent: Number(it.discountPercent ?? 0),
      total: Number(it.total),
    })),
    subtotal,
    total,
    discountAmount: Math.max(0, Math.round((subtotal - total) * 100) / 100),
    discountLabel:
      discountValue > 0
        ? quote.discountType === 'PERCENT'
          ? `${discountValue.toLocaleString('pt-BR')}%`
          : undefined
        : undefined,
    payment: describePayment({
      total,
      downPayment: Number(quote.downPayment),
      installments: quote.installments,
      method: quote.paymentMethod,
    }),
  };
}

export async function getQuotePdfData(id: string): Promise<QuoteDocumentProps | null> {
  const d = await loadQuoteForDocument(id);
  if (!d) return null;

  return {
    clinic: d.clinic,
    patient: {
      name: d.patient.name,
      document: d.patient.cpf,
      phone: d.patient.phone,
      email: d.patient.email,
      controlNumber: d.patient.controlNumber,
    },
    professional: d.professional,
    quote: {
      code: `ORC-${pad4(d.quote.number)}`,
      issuedAt: instantDateBR(d.quote.createdAt),
      validUntil: wallDateBR(d.quote.validUntil),
      items: d.items,
      subtotal: d.subtotal,
      discountAmount: d.discountAmount,
      discountLabel: d.discountLabel,
      total: d.total,
      payment: d.payment,
      notes: d.quote.notes ?? undefined,
      terms: d.terms?.quoteTerms?.trim() || DEFAULT_QUOTE_TERMS,
      generatedAt: instantDateTimeBR(new Date()),
    },
  };
}

export async function getContractPdfData(id: string): Promise<ContractDocumentProps | null> {
  const d = await loadQuoteForDocument(id);
  if (!d) return null;

  const now = new Date();
  const registroDoTitulo = d.professional?.registration ?? d.clinic.technicalRegistration;

  return {
    clinic: d.clinic,
    patient: {
      name: d.patient.name,
      document: d.patient.cpf,
      maritalStatus: maritalStatusText(d.patient.maritalStatus),
      profession: d.patient.profession ?? undefined,
      birthDate: d.patient.birthDate ? wallDateBR(d.patient.birthDate) : undefined,
      address: d.patient.address,
      phone: d.patient.phone,
      email: d.patient.email,
      isMinor: isMinor(d.patient.birthDate, now),
    },
    professional: d.professional,
    contract: {
      // Mesmo número do orçamento: CTR-0042 é o contrato do ORC-0042, e
      // ninguém precisa de uma tabela para achar um a partir do outro.
      code: `CTR-${pad4(d.quote.number)}`,
      quoteCode: `ORC-${pad4(d.quote.number)}`,
      title: contractTitle(registroDoTitulo),
      items: d.items,
      subtotal: d.subtotal,
      discountAmount: d.discountAmount,
      discountLabel: d.discountLabel,
      total: d.total,
      totalText: valorPorExtenso(d.total),
      payment: d.payment,
      extraTerms: d.terms?.contractTerms ?? undefined,
      dateLong: instantDateLongBR(now),
      issuedAt: instantDateBR(now),
      generatedAt: instantDateTimeBR(now),
    },
  };
}

/** O que falta no cadastro para o contrato deste orçamento sair completo. */
export async function getContractGaps(id: string): Promise<DocumentGap[]> {
  const { tenantId } = await requireTenant();
  const quote = await prisma.quote.findFirst({
    where: { id, tenantId },
    select: { patientId: true },
  });
  if (!quote) return [];

  const [tenant, patient] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { document: true, address: true, city: true, technicalResponsible: true },
    }),
    prisma.patient.findFirst({
      where: { id: quote.patientId, tenantId },
      select: { cpfEncrypted: true, street: true },
    }),
  ]);

  return contractGaps({
    patientId: quote.patientId,
    clinic: tenant ?? {},
    patient: { hasCpf: Boolean(patient?.cpfEncrypted), hasAddress: Boolean(patient?.street) },
  });
}

const DEFAULT_VALID_DAYS = 30;
/** Hoje no fuso da clínica + 30 dias. Usar o dia UTC daria amanhã depois das 21h. */
export async function defaultValidUntil(): Promise<string> {
  const hoje = new Date(`${clinicToday()}T00:00:00Z`);
  return addDays(hoje, DEFAULT_VALID_DAYS).toISOString().slice(0, 10);
}
