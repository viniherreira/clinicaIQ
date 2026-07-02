'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, type ToothStatus } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

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

/** BRL-masked string → number (cents-based). */
function parseBRL(value: string): number {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

// ─── Clinical record (histórico + financeiro + odontograma) ──────────────────

export async function getPatientRecord(patientId: string) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const now = new Date();

  const [appointments, quotes, payments, teeth] = await Promise.all([
    db.appointment.findMany({
      where: { patientId },
      orderBy: { startTime: 'desc' },
      take: 100,
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        type: true,
        notes: true,
        professional: { select: { name: true, color: true } },
        procedure: { select: { name: true } },
      },
    }),
    db.quote.findMany({
      where: { patientId },
      orderBy: { number: 'desc' },
      select: { id: true, number: true, status: true, total: true, createdAt: true },
    }),
    db.payment.findMany({
      where: { patientId },
      orderBy: { paidAt: 'desc' },
      select: {
        id: true,
        amount: true,
        method: true,
        notes: true,
        paidAt: true,
        quote: { select: { number: true } },
      },
    }),
    db.toothRecord.findMany({
      where: { patientId },
      select: { toothNumber: true, status: true, note: true },
    }),
  ]);

  const attended = appointments.filter((a) => a.status === 'ATTENDED');
  const upcoming = [...appointments]
    .filter((a) => new Date(a.startTime) > now && ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(a.status))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];

  const contracted = quotes
    .filter((q) => q.status === 'ACCEPTED')
    .reduce((s, q) => s + Number(q.total), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);

  return {
    appointments: appointments.map((a) => ({ ...a })),
    stats: {
      visits: attended.length,
      missed: appointments.filter((a) => a.status === 'MISSED').length,
      totalAppointments: appointments.length,
      lastVisit: attended[0]?.startTime ?? null,
      nextAppointment: upcoming?.startTime ?? null,
    },
    financial: {
      contracted,
      paid,
      balance: Math.max(0, contracted - paid),
      payments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        notes: p.notes,
        paidAt: p.paidAt,
        quoteNumber: p.quote?.number ?? null,
      })),
      acceptedQuotes: quotes
        .filter((q) => q.status === 'ACCEPTED')
        .map((q) => ({ id: q.id, number: q.number, total: Number(q.total) })),
    },
    teeth: teeth.map((t) => ({ ...t })),
  };
}

// ─── Odontograma ───────────────────────────────────────────────────────────────

const VALID_TEETH = new Set(
  [1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => q * 10 + n)),
);

export async function setToothRecord(
  patientId: string,
  toothNumber: number,
  status: ToothStatus | null,
  note?: string,
): Promise<{ ok: boolean }> {
  const { tenantId, userId } = await requireTenant();
  if (!VALID_TEETH.has(toothNumber)) return { ok: false };

  // Guard: patient must belong to this tenant.
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true },
  });
  if (!patient) return { ok: false };

  if (status === null) {
    await prisma.toothRecord.deleteMany({ where: { tenantId, patientId, toothNumber } });
  } else {
    const trimmedNote = note?.trim().slice(0, 300) || null;
    await prisma.toothRecord.upsert({
      where: { patientId_toothNumber: { patientId, toothNumber } },
      update: { status, note: trimmedNote, updatedById: userId },
      create: { tenantId, patientId, toothNumber, status, note: trimmedNote, updatedById: userId },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: status === null ? 'TOOTH_CLEAR' : `TOOTH_${status}`,
      entity: 'Patient',
      entityId: patientId,
      metadata: { toothNumber },
    },
  });

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

// ─── Pagamentos ────────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  amount: z.string().transform(parseBRL).refine((v) => v > 0, { message: 'Valor obrigatório' }),
  method: z.string().trim().max(40).optional().or(z.literal('')),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
  quoteId: z.string().optional().or(z.literal('')),
});

export type PaymentFormState =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

export async function addPayment(
  patientId: string,
  _prev: PaymentFormState | null,
  formData: FormData,
): Promise<PaymentFormState> {
  const { tenantId, userId } = await requireTenant();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { amount, method, notes, quoteId } = parsed.data;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true },
  });
  if (!patient) return { success: false, errors: { amount: ['Paciente não encontrado'] } };

  const payment = await prisma.payment.create({
    data: {
      tenantId,
      patientId,
      quoteId: quoteId || null,
      amount,
      method: method || null,
      notes: notes || null,
      createdById: userId,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'CREATE', entity: 'Payment', entityId: payment.id },
  });

  revalidatePath(`/pacientes/${patientId}`);
  return { success: true };
}

export async function deletePayment(paymentId: string, patientId: string) {
  const { tenantId, userId } = await requireTenant();
  await prisma.payment.deleteMany({ where: { id: paymentId, tenantId } });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'Payment', entityId: paymentId },
  });
  revalidatePath(`/pacientes/${patientId}`);
}
