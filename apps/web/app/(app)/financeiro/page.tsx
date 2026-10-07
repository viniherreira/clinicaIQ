import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowDownCircle, Clock, AlertTriangle, TrendingUp, ArrowRight } from 'lucide-react';
import { clinicToday } from '@/lib/tz';
import { getFinanceData, type SeriesPoint } from './actions';
import { getReportData, type ReportType } from './report-actions';
import { FinanceFilters } from './_components/finance-filters';
import { FinancialDetail } from './_components/financial-detail';

import { requireCapability } from '@/lib/guard';
export const metadata = { title: 'Financeiro · ClinicaIQ' };

const TYPES: ReportType[] = ['recebimentos', 'orcamentos', 'agendamentos'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function brl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function periodLabel(from: string, to: string) {
  const f = new Date(`${from}T12:00:00.000Z`);
  const t = new Date(`${to}T12:00:00.000Z`);
  if (from === to) return format(f, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return `${format(f, 'd MMM', { locale: ptBR })} — ${format(t, "d MMM yyyy", { locale: ptBR })}`;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Financeiro e relatórios numa tela só.
 *
 * Em cima, o resumo do período: quanto entrou, quanto falta receber, o que
 * venceu e quanto a clínica produziu. Embaixo, o detalhamento — recebimentos,
 * orçamentos ou agendamentos, linha a linha, com CSV e impressão. Os filtros
 * do topo valem para os dois, e cada número do resumo abre o detalhe dele.
 */
export default async function FinanceiroPage({ searchParams }: PageProps) {
  await requireCapability('financeiro');

  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);

  const today = clinicToday();
  const from = DATE_RE.test(one('from') ?? '') ? (one('from') as string) : `${today.slice(0, 8)}01`;
  const to = DATE_RE.test(one('to') ?? '') ? (one('to') as string) : today;
  const professionalId = one('professionalId') ?? '';
  const procedureId = one('procedureId') ?? '';
  const type = (TYPES.includes(one('type') as ReportType) ? one('type') : 'recebimentos') as ReportType;
  const status = one('status') ?? '';

  const [data, report] = await Promise.all([
    getFinanceData({ from, to, professionalId, procedureId }),
    getReportData({ type, from, to, professionalId, procedureId, status }),
  ]);
  const { kpis, byMethod, byProfessional, byProcedure, filters, dailySeries } = data;

  const ticket = kpis.paymentsCount > 0 ? kpis.received / kpis.paymentsCount : 0;

  /** Mesma tela, outro detalhe: mantém período e filtros, troca o que se lista. */
  const detalhe = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ from, to });
    if (professionalId) params.set('professionalId', professionalId);
    if (procedureId) params.set('procedureId', procedureId);
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return `/financeiro?${params.toString()}#detalhe`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 lg:p-8 print:p-0">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="capitalize">{periodLabel(from, to)}</span>
          <span className="print:hidden"> · resumo, recebimentos, orçamentos e agendamentos do período</span>
        </p>
      </header>

      <div className="print:hidden">
        <FinanceFilters
          from={from}
          to={to}
          professionalId={professionalId}
          procedureId={procedureId}
          professionals={filters.professionals}
          procedures={filters.procedures}
        />
      </div>

      {/* KPIs — cada um abre o detalhe correspondente logo abaixo */}
      <section aria-label="Resumo financeiro" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          icon={ArrowDownCircle}
          tone="success"
          label="Recebido no período"
          value={brl(kpis.received)}
          hint={`${kpis.paymentsCount} pagamento${kpis.paymentsCount !== 1 ? 's' : ''}${ticket > 0 ? ` · média ${brl(ticket)}` : ''}`}
          href={detalhe({ type: 'recebimentos' })}
        />
        <Kpi
          icon={Clock}
          tone="default"
          label="A receber"
          value={brl(kpis.outstanding)}
          hint="orçamentos aprovados em aberto"
          href="/orcamentos?status=ACCEPTED"
        />
        <Kpi
          icon={AlertTriangle}
          tone={kpis.overdue > 0 ? 'danger' : 'muted'}
          label="Vencido"
          value={brl(kpis.overdue)}
          hint="a receber em atraso"
          href="/orcamentos?status=ACCEPTED"
        />
        <Kpi
          icon={TrendingUp}
          tone="primary"
          label="Produção"
          value={brl(kpis.production)}
          hint={`${kpis.attendedCount} atendimento${kpis.attendedCount !== 1 ? 's' : ''} concluído${kpis.attendedCount !== 1 ? 's' : ''}`}
          href={detalhe({ type: 'agendamentos', status: 'ATTENDED' })}
        />
      </section>

      <RevenueChart points={dailySeries} total={kpis.received} />

      <div className="grid gap-5 lg:grid-cols-3">
        <BreakdownCard
          title="Por forma de pagamento"
          total={kpis.received}
          rows={byMethod.map((m) => ({ label: m.method, value: m.value }))}
          emptyLabel="Sem recebimentos"
          href={detalhe({ type: 'recebimentos' })}
        />
        <BreakdownCard
          title="Produção por profissional"
          total={kpis.production}
          rows={byProfessional.map((p) => ({
            label: p.name,
            value: p.value,
            meta: `${p.count} atend.`,
            href: detalhe({ type: 'agendamentos', status: 'ATTENDED', professionalId: p.id }),
          }))}
          emptyLabel="Sem atendimentos"
          href={detalhe({ type: 'agendamentos', status: 'ATTENDED' })}
        />
        <BreakdownCard
          title="Por procedimento"
          total={kpis.production}
          rows={byProcedure.map((p) => ({
            label: p.name,
            value: p.value,
            meta: `${p.count}×`,
            href: p.id !== 'none' ? detalhe({ type: 'agendamentos', status: 'ATTENDED', procedureId: p.id }) : undefined,
          }))}
          emptyLabel="Sem atendimentos"
          href={detalhe({ type: 'agendamentos', status: 'ATTENDED' })}
        />
      </div>

      <FinancialDetail type={type} status={status} from={from} to={to} data={report} />

      <p className="text-xs text-muted-foreground print:hidden">
        <strong className="font-medium text-foreground">Recebido</strong> vem dos pagamentos registrados nos orçamentos.{' '}
        <strong className="font-medium text-foreground">A receber</strong> é o saldo de orçamentos aprovados.{' '}
        <strong className="font-medium text-foreground">Produção</strong> soma os atendimentos concluídos, pelo preço-base do procedimento.
      </p>
    </div>
  );
}

// ─── UI bits ─────────────────────────────────────────────────────────────────

function RevenueChart({ points, total }: { points: SeriesPoint[]; total: number }) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points.map((p) => p.value));
  const grouping = points[0].grouping;
  // Keep tick labels readable when there are many buckets.
  const step = Math.ceil(points.length / 12);

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card print:hidden" aria-label="Recebimentos ao longo do período">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Recebimentos por {grouping === 'day' ? 'dia' : 'mês'}
        </h2>
        <span className="text-xs text-muted-foreground">pico {brl(max)}</span>
      </div>
      <div
        className="flex h-36 items-end gap-1"
        role="img"
        aria-label={`Recebimentos: ${points.map((p) => `${p.label} ${brl(p.value)}`).join(', ')}. Total ${brl(total)}.`}
      >
        {points.map((p, i) => (
          <div key={p.key} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div className="relative flex flex-1 items-end">
              <div
                className={`w-full rounded-t transition-colors ${p.value > 0 ? 'bg-primary/75 group-hover:bg-primary' : 'bg-surface-alt'}`}
                style={{ height: `${Math.max(p.value > 0 ? 4 : 2, (p.value / max) * 100)}%` }}
                title={`${p.label}: ${brl(p.value)}`}
              />
            </div>
            <span className="truncate text-center text-[9px] text-muted-foreground">
              {i % step === 0 ? p.label : ' '}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Total recebido</span>
        <span className="font-semibold tabular-nums text-success">{brl(total)}</span>
      </div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  hint: string;
  tone: 'default' | 'primary' | 'success' | 'danger' | 'muted';
  href?: string;
}) {
  const toneCls = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    danger: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];

  const inner = (
    <>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <p className="text-xs font-medium">{label}</p>
        {href && <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 print:hidden" aria-hidden="true" />}
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${toneCls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </>
  );

  const base = 'group block rounded-xl border border-border bg-surface p-4 shadow-card';
  return href ? (
    <Link href={href} className={`${base} transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

function BreakdownCard({
  title,
  total,
  rows,
  emptyLabel,
  href,
}: {
  title: string;
  total: number;
  rows: { label: string; value: number; meta?: string; href?: string }[];
  emptyLabel: string;
  href?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-card print:break-inside-avoid">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {href && rows.length > 0 && (
          <Link href={href} aria-label={`Ver detalhe: ${title}`} className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 flex-1 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 flex-1 space-y-3">
          {rows.slice(0, 6).map((r) => {
            const body = (
              <>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{r.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{brl(r.value)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt" role="presentation">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(r.value / max) * 100}%` }} />
                  </div>
                  {r.meta && <span className="shrink-0 text-[11px] text-muted-foreground">{r.meta}</span>}
                </div>
              </>
            );
            return (
              <li key={r.label}>
                {r.href ? (
                  <Link href={r.href} className="block rounded-md p-1 -m-1 transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">{brl(total)}</span>
        </div>
      )}
    </section>
  );
}
