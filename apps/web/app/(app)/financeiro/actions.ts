'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { redirect } from 'next/navigation';

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

// ─── Amount in words (pt-BR, reais) ──────────────────────────────────────────

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function under1000(n: number): string {
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 20) parts.push(UNITS[rest]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u > 0 ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]);
    }
  }
  return parts.join(' e ');
}

function intToWords(n: number): string {
  if (n === 0) return 'zero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) parts.push(millions === 1 ? 'um milhão' : `${under1000(millions)} milhões`);
  if (thousands > 0) parts.push(thousands === 1 ? 'mil' : `${under1000(thousands)} mil`);
  if (rest > 0) parts.push(under1000(rest));
  return parts.join(parts.length > 1 && rest > 0 && rest < 100 ? ' e ' : ', ').replace(/, ([^,]*)$/, ' e $1');
}

/** "R$ 1.234,50" spoken as "mil duzentos e trinta e quatro reais e cinquenta centavos". */
function valorPorExtenso(value: number): string {
  const reais = Math.floor(value + 1e-6);
  const cents = Math.round((value - reais) * 100);
  const reaisText = `${intToWords(reais)} ${reais === 1 ? 'real' : 'reais'}`;
  if (cents === 0) return reaisText;
  const centsText = `${intToWords(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`;
  return `${reaisText} e ${centsText}`;
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
        quote: { select: { number: true } },
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

  return {
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
