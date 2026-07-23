'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { valorPorExtenso } from '@/lib/extenso';

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');
  return { tenantId: tenant.id };
}

export interface SeriesPoint {
  /** Bucket key: yyyy-MM-dd (daily) or yyyy-MM (monthly). */
  key: string;
  label: string;
  value: number;
  grouping: 'day' | 'month';
}

const CLINIC_TZ = 'America/Sao_Paulo';
const dayKeyOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(d);

/** Buckets received money across the period — daily up to ~45 days, else monthly. */
function buildSeries(
  from: string,
  to: string,
  payments: { amount: unknown; paidAt: Date }[],
): SeriesPoint[] {
  const start = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const grouping: 'day' | 'month' = spanDays > 45 ? 'month' : 'day';

  const totals = new Map<string, number>();
  for (const p of payments) {
    const dk = dayKeyOf(p.paidAt);
    const key = grouping === 'day' ? dk : dk.slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + Number(p.amount));
  }

  const points: SeriesPoint[] = [];
  if (grouping === 'day') {
    for (let i = 0; i < Math.min(spanDays, 92); i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      points.push({
        key,
        label: `${key.slice(8, 10)}/${key.slice(5, 7)}`,
        value: totals.get(key) ?? 0,
        grouping,
      });
    }
  } else {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end && points.length < 24) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      points.push({
        key,
        label: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(cursor).replace('.', ''),
        value: totals.get(key) ?? 0,
        grouping,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return points;
}

export interface FinanceParams {
  from: string; // yyyy-MM-dd (clinic date)
  to: string; // yyyy-MM-dd (clinic date, inclusive)
  professionalId?: string;
  procedureId?: string;
}

export type FinanceData = Awaited<ReturnType<typeof getFinanceData>>;

/**
 * Financial overview for a period. "Recebido" comes from Payment rows (real
 * money in); "a receber"/"vencido" from accepted quotes not fully paid;
 * "produção" per professional/procedure from attended appointments valued at
 * the procedure base price. Period bounds use the clinic-date→UTC range, matching
 * the rest of the app's wall-clock-as-UTC model.
 */
export async function getFinanceData(params: FinanceParams) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const start = new Date(`${params.from}T00:00:00.000Z`);
  const end = new Date(`${params.to}T23:59:59.999Z`);
  const now = new Date();
  const profFilter = params.professionalId || undefined;
  const procFilter = params.procedureId || undefined;

  const [payments, acceptedQuotes, attended, professionals, procedures] = await Promise.all([
    db.payment.findMany({
      where: {
        paidAt: { gte: start, lte: end },
        ...(procFilter ? { quote: { items: { some: { procedureId: procFilter } } } } : {}),
      },
      select: {
        id: true,
        amount: true,
        method: true,
        paidAt: true,
        patient: { select: { id: true, name: true } },
        quote: { select: { id: true, number: true } },
      },
      orderBy: { paidAt: 'desc' },
    }),
    db.quote.findMany({
      where: { status: 'ACCEPTED' },
      select: {
        total: true,
        validUntil: true,
        payments: { select: { amount: true } },
      },
    }),
    db.appointment.findMany({
      where: {
        status: 'ATTENDED',
        startTime: { gte: start, lte: end },
        ...(profFilter ? { professionalId: profFilter } : {}),
        ...(procFilter ? { procedureId: procFilter } : {}),
      },
      select: {
        professional: { select: { id: true, name: true, color: true } },
        procedure: { select: { id: true, name: true, basePrice: true } },
      },
    }),
    db.professional.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.procedure.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  // ── KPIs ────────────────────────────────────────────────────────
  const received = payments.reduce((s, p) => s + Number(p.amount), 0);

  let outstanding = 0;
  let overdue = 0;
  for (const q of acceptedQuotes) {
    const paid = q.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(q.total) - paid;
    if (balance > 0.005) {
      outstanding += balance;
      if (q.validUntil < now) overdue += balance;
    }
  }

  const production = attended.reduce((s, a) => s + (a.procedure ? Number(a.procedure.basePrice) : 0), 0);

  // ── By payment method ───────────────────────────────────────────
  const methodMap = new Map<string, number>();
  for (const p of payments) {
    const key = p.method ?? 'Não informado';
    methodMap.set(key, (methodMap.get(key) ?? 0) + Number(p.amount));
  }
  const byMethod = [...methodMap.entries()]
    .map(([method, value]) => ({ method, value }))
    .sort((a, b) => b.value - a.value);

  // ── Production by professional (attended × base price) ──────────
  const profMap = new Map<string, { id: string; name: string; color: string | null; count: number; value: number }>();
  for (const a of attended) {
    const cur = profMap.get(a.professional.id) ?? {
      id: a.professional.id,
      name: a.professional.name,
      color: a.professional.color,
      count: 0,
      value: 0,
    };
    cur.count += 1;
    cur.value += a.procedure ? Number(a.procedure.basePrice) : 0;
    profMap.set(a.professional.id, cur);
  }
  const byProfessional = [...profMap.values()].sort((a, b) => b.value - a.value);

  // ── Production by procedure ─────────────────────────────────────
  const procMap = new Map<string, { id: string; name: string; count: number; value: number }>();
  for (const a of attended) {
    const id = a.procedure?.id ?? 'none';
    const cur = procMap.get(id) ?? { id, name: a.procedure?.name ?? 'Sem procedimento', count: 0, value: 0 };
    cur.count += 1;
    cur.value += a.procedure ? Number(a.procedure.basePrice) : 0;
    procMap.set(id, cur);
  }
  const byProcedure = [...procMap.values()].sort((a, b) => b.value - a.value);

  // ── Received over time (daily buckets, or monthly for long periods) ──
  const dailySeries = buildSeries(params.from, params.to, payments);

  return {
    dailySeries,
    kpis: {
      received,
      outstanding,
      overdue,
      production,
      paymentsCount: payments.length,
      attendedCount: attended.length,
    },
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      paidAt: p.paidAt,
      patient: p.patient.name,
      patientId: p.patient.id,
      quoteId: p.quote?.id ?? null,
      quoteNumber: p.quote?.number ?? null,
    })),
    byMethod,
    byProfessional,
    byProcedure,
    filters: { professionals, procedures },
  };
}

// ─── Receipt (PDF data) ──────────────────────────────────────────────────────

interface ReceiptData {
  clinic: { name: string; phone?: string; email?: string; document?: string };
  receipt: {
    number: string;
    patientName: string;
    amount: number;
    amountText: string;
    method?: string;
    paidAt: string;
    reference: string;
  };
}

/** Builds the props for a payment receipt PDF (tenant-scoped by id). */
export async function getReceiptData(paymentId: string): Promise<ReceiptData | null> {
  const { tenantId } = await requireTenant();

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId },
    select: {
      id: true,
      amount: true,
      method: true,
      paidAt: true,
      patient: { select: { name: true } },
      quote: { select: { number: true } },
      tenant: { select: { name: true, phone: true, email: true, document: true } },
    },
  });
  if (!payment) return null;

  const amount = Number(payment.amount);
  return {
    clinic: {
      name: payment.tenant.name,
      phone: payment.tenant.phone ?? undefined,
      email: payment.tenant.email ?? undefined,
      document: payment.tenant.document ?? undefined,
    },
    receipt: {
      number: `REC-${payment.id.slice(-8).toUpperCase()}`,
      patientName: payment.patient.name,
      amount,
      amountText: valorPorExtenso(amount),
      method: payment.method ?? undefined,
      paidAt: payment.paidAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      reference: payment.quote?.number
        ? `Orçamento ORC-${String(payment.quote.number).padStart(4, '0')}`
        : 'atendimento na clínica',
    },
  };
}
