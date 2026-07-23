import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowDownCircle, Clock, AlertTriangle, TrendingUp, FileText, Receipt, ArrowRight,
} from 'lucide-react';
import { clinicToday } from '@/lib/tz';
import { getFinanceData, type SeriesPoint } from './actions';
import { FinanceFilters } from './_components/finance-filters';

export const metadata = { title: 'Financeiro · ClinicaIQ' };

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
  searchParams: Promise<{ from?: string; to?: string; professionalId?: string; procedureId?: string }>;
}

export default async function FinanceiroPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const today = clinicToday();
  const from = sp.from ?? `${today.slice(0, 8)}01`;
  const to = sp.to ?? today;
  const professionalId = sp.professionalId ?? '';
  const procedureId = sp.procedureId ?? '';

  const data = await getFinanceData({ from, to, professionalId, procedureId });
  const { kpis, payments, byMethod, byProfessional, byProcedure, filters, dailySeries } = data;

  const period = `from=${from}&to=${to}`;
  const ticket = kpis.paymentsCount > 0 ? kpis.received / kpis.paymentsCount : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{periodLabel(from, to)}</p>
        </div>
        <Link href={`/relatorios?type=recebimentos&${period}`} className="btn-outline btn-md">
          <FileText className="h-4 w-4" aria-hidden="true" /> Abrir no relatório
        </Link>
      </header>

      <FinanceFilters
        from={from}
        to={to}
        professionalId={professionalId}
        procedureId={procedureId}
        professionals={filters.professionals}
        procedures={filters.procedures}
      />

      {/* KPIs — each one opens the matching detail */}
      <section aria-label="Resumo financeiro" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          icon={ArrowDownCircle}
          tone="success"
          label="Recebido no período"
          value={brl(kpis.received)}
          hint={`${kpis.paymentsCount} pagamento${kpis.paymentsCount !== 1 ? 's' : ''}${ticket > 0 ? ` · média ${brl(ticket)}` : ''}`}
          href={`/relatorios?type=recebimentos&${period}`}
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
          href={`/relatorios?type=agendamentos&status=ATTENDED&${period}`}
        />
      </section>

      {/* Revenue over time */}
      <RevenueChart points={dailySeries} total={kpis.received} />

      {/* Recebimentos */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Recebimentos</h2>
          <span className="text-xs text-muted-foreground">{brl(kpis.received)} no período</span>
        </div>

        {payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Receipt className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Nenhum recebimento no período</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Registre o pagamento dentro de um orçamento aprovado e ele aparece aqui.
            </p>
            <Link href="/orcamentos" className="btn-outline btn-md mt-4">Ver orçamentos</Link>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-border sm:hidden">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/pacientes/${p.patientId}`} className="truncate text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      {p.patient}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {format(new Date(p.paidAt), 'dd/MM/yyyy')}
                      {p.method && ` · ${p.method}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-success">{brl(p.amount)}</span>
                    <Link href={`/financeiro/recibo/${p.id}`} className="text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      Recibo
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Recebimentos no período</caption>
                <thead>
                  <tr className="border-b border-border bg-surface-alt text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-medium">Data</th>
                    <th scope="col" className="px-5 py-3 font-medium">Paciente</th>
                    <th scope="col" className="px-5 py-3 font-medium">Forma</th>
                    <th scope="col" className="px-5 py-3 font-medium">Orçamento</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Valor</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Recibo</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50">
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">{format(new Date(p.paidAt), 'dd/MM/yyyy')}</td>
                      <td className="px-5 py-3">
                        <Link href={`/pacientes/${p.patientId}`} className="font-medium transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          {p.patient}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{p.method ?? '—'}</td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {p.quoteId && p.quoteNumber ? (
                          <Link href={`/orcamentos/${p.quoteId}`} className="text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                            ORC-{String(p.quoteNumber).padStart(4, '0')}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-success">{brl(p.amount)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/financeiro/recibo/${p.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface-alt/60 text-sm font-semibold">
                    <td className="px-5 py-3" colSpan={4}>Total do período</td>
                    <td className="px-5 py-3 text-right tabular-nums text-success">{brl(kpis.received)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Breakdowns */}
      <div className="grid gap-5 lg:grid-cols-3">
        <BreakdownCard
          title="Por forma de pagamento"
          total={kpis.received}
          rows={byMethod.map((m) => ({ label: m.method, value: m.value }))}
          emptyLabel="Sem recebimentos"
          href={`/relatorios?type=recebimentos&${period}`}
        />
        <BreakdownCard
          title="Produção por profissional"
          total={kpis.production}
          rows={byProfessional.map((p) => ({ label: p.name, value: p.value, meta: `${p.count} atend.`, href: `/relatorios?type=agendamentos&status=ATTENDED&professionalId=${p.id}&${period}` }))}
          emptyLabel="Sem atendimentos"
          href={`/relatorios?type=agendamentos&status=ATTENDED&${period}`}
        />
        <BreakdownCard
          title="Por procedimento"
          total={kpis.production}
          rows={byProcedure.map((p) => ({ label: p.name, value: p.value, meta: `${p.count}×`, href: p.id !== 'none' ? `/relatorios?type=agendamentos&status=ATTENDED&procedureId=${p.id}&${period}` : undefined }))}
          emptyLabel="Sem atendimentos"
          href={`/relatorios?type=agendamentos&status=ATTENDED&${period}`}
        />
      </div>

      <p className="text-xs text-muted-foreground">
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
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card" aria-label="Recebimentos ao longo do período">
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
              {i % step === 0 ? p.label : ' '}
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
        {href && <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}
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
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {href && rows.length > 0 && (
          <Link href={href} aria-label={`Ver detalhe: ${title}`} className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
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
