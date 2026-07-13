import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowDownCircle, Clock, AlertTriangle, TrendingUp, FileText, Receipt } from 'lucide-react';
import { clinicToday } from '@/lib/tz';
import { getFinanceData } from './actions';
import { FinanceFilters } from './_components/finance-filters';

export const metadata = { title: 'Financeiro · ClinicaIQ' };

function brl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function periodLabel(from: string, to: string) {
  const f = new Date(`${from}T12:00:00.000Z`);
  const t = new Date(`${to}T12:00:00.000Z`);
  if (from === to) return format(f, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return `${format(f, "d MMM", { locale: ptBR })} — ${format(t, "d MMM yyyy", { locale: ptBR })}`;
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
  const { kpis, payments, byMethod, byProfessional, byProcedure, filters } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">{periodLabel(from, to)}</p>
      </header>

      <FinanceFilters
        from={from}
        to={to}
        professionalId={professionalId}
        procedureId={procedureId}
        professionals={filters.professionals}
        procedures={filters.procedures}
      />

      {/* KPIs */}
      <section aria-label="Resumo financeiro" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          icon={ArrowDownCircle}
          tone="success"
          label="Recebido no período"
          value={brl(kpis.received)}
          hint={`${kpis.paymentsCount} pagamento${kpis.paymentsCount !== 1 ? 's' : ''}`}
        />
        <Kpi
          icon={Clock}
          tone="default"
          label="A receber"
          value={brl(kpis.outstanding)}
          hint="orçamentos aceitos em aberto"
        />
        <Kpi
          icon={AlertTriangle}
          tone={kpis.overdue > 0 ? 'danger' : 'muted'}
          label="Vencido"
          value={brl(kpis.overdue)}
          hint="a receber em atraso"
        />
        <Kpi
          icon={TrendingUp}
          tone="primary"
          label="Produção"
          value={brl(kpis.production)}
          hint={`${kpis.attendedCount} atendimento${kpis.attendedCount !== 1 ? 's' : ''}`}
        />
      </section>

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
              Os pagamentos registrados nos orçamentos aparecem aqui.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-border sm:hidden">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.patient}</p>
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
                      <td className="px-5 py-3 font-medium">{p.patient}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.method ?? '—'}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{p.quoteNumber ? `ORC-${String(p.quoteNumber).padStart(4, '0')}` : '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-success">{brl(p.amount)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/financeiro/recibo/${p.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Breakdowns */}
      <div className="grid gap-5 lg:grid-cols-3">
        <BreakdownCard title="Por forma de pagamento" total={kpis.received} rows={byMethod.map((m) => ({ label: m.method, value: m.value }))} emptyLabel="Sem recebimentos" />
        <BreakdownCard
          title="Produção por profissional"
          total={kpis.production}
          rows={byProfessional.map((p) => ({ label: p.name, value: p.value, meta: `${p.count} atend.` }))}
          emptyLabel="Sem atendimentos"
        />
        <BreakdownCard
          title="Por procedimento"
          total={kpis.production}
          rows={byProcedure.map((p) => ({ label: p.name, value: p.value, meta: `${p.count}×` }))}
          emptyLabel="Sem atendimentos"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Recebido vem dos pagamentos registrados. Produção é a soma dos atendimentos concluídos no período,
        avaliados pelo preço-base de cada procedimento.
      </p>
    </div>
  );
}

// ─── UI bits ─────────────────────────────────────────────────────────────────

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  hint: string;
  tone: 'default' | 'primary' | 'success' | 'danger' | 'muted';
}) {
  const toneCls = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    danger: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${toneCls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  total,
  rows,
  emptyLabel,
}: {
  title: string;
  total: number;
  rows: { label: string; value: number; meta?: string }[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.slice(0, 6).map((r) => (
            <li key={r.label}>
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
            </li>
          ))}
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
