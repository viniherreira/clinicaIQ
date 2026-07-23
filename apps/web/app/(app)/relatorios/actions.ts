'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { wallClockTime } from '@/lib/tz';

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

export type ReportType = 'agendamentos' | 'orcamentos' | 'recebimentos';

export interface ReportParams {
  type: ReportType;
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd (inclusive)
  professionalId?: string;
  procedureId?: string;
  status?: string;
}

export interface ReportRow {
  /** Pre-formatted display strings (also used for CSV). */
  cells: string[];
  /** Where clicking the row goes (patient / quote), when there is a record. */
  href?: string;
}

export interface ReportResult {
  columns: string[];
  rows: ReportRow[];
  /** Column index → total, rendered in the table footer. */
  totals?: Record<number, string>;
  summary: { label: string; value: string }[];
  filters: {
    professionals: { id: string; name: string }[];
    procedures: { id: string; name: string }[];
  };
}

const APPT_STATUS_PT: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  RESCHEDULED: 'Remarcado',
  CANCELLED: 'Cancelado',
  ATTENDED: 'Compareceu',
  MISSED: 'Faltou',
};

const QUOTE_STATUS_PT: Record<string, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  VIEWED: 'Visualizado',
  ACCEPTED: 'Aceito',
  REJECTED: 'Recusado',
  EXPIRED: 'Expirado',
};

const APPT_STATUSES = Object.keys(APPT_STATUS_PT);
const QUOTE_STATUSES = Object.keys(QUOTE_STATUS_PT);

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtNum = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/** Wall-clock stored dates: read the calendar date from the UTC components. */
const wallDate = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
/** Real timestamps (createdAt/paidAt): format in the clinic timezone. */
const clockDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export async function getReportData(params: ReportParams): Promise<ReportResult> {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const start = new Date(`${params.from}T00:00:00.000Z`);
  const end = new Date(`${params.to}T23:59:59.999Z`);
  const prof = params.professionalId || undefined;
  const proc = params.procedureId || undefined;

  const [professionals, procedures] = await Promise.all([
    db.professional.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.procedure.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const filters = { professionals, procedures };

  // ── Agendamentos ────────────────────────────────────────────────────────────
  if (params.type === 'agendamentos') {
    const status = params.status && APPT_STATUSES.includes(params.status) ? params.status : undefined;
    const appts = await db.appointment.findMany({
      where: {
        startTime: { gte: start, lte: end },
        ...(prof ? { professionalId: prof } : {}),
        ...(proc ? { procedureId: proc } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        patient: { select: { id: true, name: true } },
        professional: { select: { name: true } },
        procedure: { select: { name: true, basePrice: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    const byStatus: Record<string, number> = {};
    let producao = 0;
    let agendado = 0;
    for (const a of appts) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      const price = a.procedure ? Number(a.procedure.basePrice) : 0;
      agendado += price;
      if (a.status === 'ATTENDED') producao += price;
    }

    const summary = [
      { label: 'Agendamentos', value: String(appts.length) },
      { label: 'Compareceram', value: String(byStatus.ATTENDED ?? 0) },
      { label: 'Faltas', value: String(byStatus.MISSED ?? 0) },
      { label: 'Cancelados', value: String(byStatus.CANCELLED ?? 0) },
      { label: 'Produção', value: fmtBRL(producao) },
    ];

    return {
      columns: ['Data', 'Hora', 'Paciente', 'Profissional', 'Procedimento', 'Situação', 'Valor (R$)'],
      rows: appts.map((a) => ({
        cells: [
          wallDate(a.startTime),
          wallClockTime(a.startTime),
          a.patient.name,
          a.professional.name,
          a.procedure?.name ?? '—',
          APPT_STATUS_PT[a.status] ?? a.status,
          fmtNum(a.procedure ? Number(a.procedure.basePrice) : 0),
        ],
        href: `/pacientes/${a.patient.id}`,
      })),
      totals: {
        4: `${appts.length} agendamento${appts.length !== 1 ? 's' : ''}`,
        5: `produção ${fmtBRL(producao)}`,
        6: fmtNum(agendado),
      },
      summary,
      filters,
    };
  }

  // ── Orçamentos ──────────────────────────────────────────────────────────────
  if (params.type === 'orcamentos') {
    const status = params.status && QUOTE_STATUSES.includes(params.status) ? params.status : undefined;
    const quotes = await db.quote.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...(status ? { status: status as never } : {}),
        ...(proc ? { items: { some: { procedureId: proc } } } : {}),
      },
      include: {
        patient: { select: { name: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let total = 0;
    let pago = 0;
    let aceitos = 0;
    for (const q of quotes) {
      total += Number(q.total);
      pago += q.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (q.status === 'ACCEPTED') aceitos += 1;
    }
    const enviados = quotes.filter((q) => q.status !== 'DRAFT').length;

    const summary = [
      { label: 'Orçamentos', value: String(quotes.length) },
      { label: 'Aceitos', value: String(aceitos) },
      { label: 'Conversão', value: enviados > 0 ? `${Math.round((aceitos / enviados) * 100)}%` : '—' },
      { label: 'Valor total', value: fmtBRL(total) },
      { label: 'Recebido', value: fmtBRL(pago) },
    ];

    return {
      columns: ['Nº', 'Criado em', 'Paciente', 'Validade', 'Situação', 'Total (R$)', 'Pago (R$)'],
      rows: quotes.map((q) => ({
        cells: [
          `ORC-${String(q.number).padStart(4, '0')}`,
          clockDate(q.createdAt),
          q.patient.name,
          wallDate(q.validUntil),
          QUOTE_STATUS_PT[q.status] ?? q.status,
          fmtNum(Number(q.total)),
          fmtNum(q.payments.reduce((s, p) => s + Number(p.amount), 0)),
        ],
        href: `/orcamentos/${q.id}`,
      })),
      totals: { 5: fmtNum(total), 6: fmtNum(pago) },
      summary,
      filters,
    };
  }

  // ── Recebimentos ────────────────────────────────────────────────────────────
  const payments = await db.payment.findMany({
    where: {
      paidAt: { gte: start, lte: end },
      ...(proc ? { quote: { items: { some: { procedureId: proc } } } } : {}),
    },
    include: {
      patient: { select: { id: true, name: true } },
      quote: { select: { id: true, number: true } },
    },
    orderBy: { paidAt: 'desc' },
  });

  const totalRecebido = payments.reduce((s, p) => s + Number(p.amount), 0);
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    const m = p.method || 'Não informado';
    byMethod[m] = (byMethod[m] ?? 0) + Number(p.amount);
  }
  const topMethod = Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0];

  const summary = [
    { label: 'Recebimentos', value: String(payments.length) },
    { label: 'Total recebido', value: fmtBRL(totalRecebido) },
    ...(topMethod ? [{ label: `Maior forma (${topMethod[0]})`, value: fmtBRL(topMethod[1]) }] : []),
  ];

  return {
    columns: ['Data', 'Paciente', 'Forma de pagamento', 'Orçamento', 'Valor (R$)'],
    rows: payments.map((p) => ({
      cells: [
        clockDate(p.paidAt),
        p.patient.name,
        p.method || 'Não informado',
        p.quote?.number ? `ORC-${String(p.quote.number).padStart(4, '0')}` : '—',
        fmtNum(Number(p.amount)),
      ],
      href: p.quote?.id ? `/orcamentos/${p.quote.id}` : `/pacientes/${p.patient.id}`,
    })),
    totals: { 4: fmtNum(totalRecebido) },
    summary,
    filters,
  };
}
