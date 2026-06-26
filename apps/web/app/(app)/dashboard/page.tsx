import Link from 'next/link';
import { getDashboardData } from './actions';

export const metadata = { title: 'Dashboard · ClinicaIQ' };

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  SCHEDULED: { label: 'Agendado', dot: 'bg-slate-400', text: 'text-muted-foreground' },
  CONFIRMED: { label: 'Confirmado', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  ATTENDED: { label: 'Compareceu', dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-400' },
  MISSED: { label: 'Faltou', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
  CANCELLED: { label: 'Cancelado', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
  RESCHEDULED: { label: 'Remarcado', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
};

export default async function DashboardPage() {
  const { today, counts, series, quoteStats, dateLabel } = await getDashboardData();
  const maxBar = Math.max(1, ...series.map((d) => d.total));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">{dateLabel}</p>
      </header>

      {/* KPIs */}
      <section aria-label="Resumo do dia" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Agendados hoje" value={counts.total} hint="no total" />
        <Kpi label="Confirmados" value={counts.confirmed} hint={`${counts.confirmedPct}% do dia`} tone="success" />
        <Kpi label="A confirmar" value={counts.toConfirm} hint="aguardando" tone="warning" />
        <Kpi label="Faltas" value={counts.missed} hint="hoje" tone={counts.missed > 0 ? 'danger' : 'muted'} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: chart + today's list */}
        <div className="space-y-6 lg:col-span-2">
          {/* 7-day chart */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Atendimentos · últimos 7 dias</h2>
              <span className="text-xs text-muted-foreground">{series.reduce((s, d) => s + d.total, 0)} no período</span>
            </div>
            <div className="flex items-end justify-between gap-2" role="img" aria-label={`Gráfico de atendimentos: ${series.map((d) => `${d.label} ${d.total}`).join(', ')}`}>
              {series.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-32 w-full items-end justify-center">
                    <div
                      className={`w-full max-w-9 rounded-t-md transition-all ${d.isToday ? 'bg-primary' : 'bg-primary/30'}`}
                      style={{ height: `${(d.total / maxBar) * 100}%`, minHeight: d.total > 0 ? 6 : 2 }}
                      title={`${d.total} atendimento(s)`}
                    />
                  </div>
                  <span className={`text-[11px] capitalize ${d.isToday ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{d.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Today's schedule */}
          <section className="rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Agenda de hoje</h2>
              <Link href="/agenda" className="text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Abrir agenda →
              </Link>
            </div>
            {today.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum atendimento agendado para hoje.</p>
            ) : (
              <ul className="divide-y divide-border">
                {today.map((a) => {
                  const meta = STATUS_META[a.status] ?? STATUS_META.SCHEDULED;
                  return (
                    <li key={a.id}>
                      <Link href="/agenda" className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                        <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{a.time}</span>
                        <span className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: a.professionalColor ?? '#94a3b8' }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{a.patient}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.professional}{a.procedure && ` · ${a.procedure}`}
                          </span>
                        </span>
                        <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${meta.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                          <span className="hidden sm:inline">{meta.label}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right: quotes */}
        <aside className="space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Orçamentos · 30 dias</h2>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Enviados" value={String(quoteStats.sent)} />
                <Stat label="Aceitos" value={String(quoteStats.accepted)} tone="success" />
              </div>
              <div className="rounded-lg bg-surface-alt p-4">
                <p className="text-xs text-muted-foreground">Conversão</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight text-primary">{quoteStats.conversion}%</p>
              </div>
              <div className="rounded-lg bg-surface-alt p-4">
                <p className="text-xs text-muted-foreground">Valor aceito</p>
                <p className="mt-0.5 text-xl font-semibold tracking-tight">{formatCurrency(quoteStats.acceptedValue)}</p>
              </div>
              <Link href="/orcamentos" className="flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Ver orçamentos
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number;
  hint: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const toneCls = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight ${toneCls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="rounded-lg bg-surface-alt p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tracking-tight ${tone === 'success' ? 'text-success' : ''}`}>{value}</p>
    </div>
  );
}
