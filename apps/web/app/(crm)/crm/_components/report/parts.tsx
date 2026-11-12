import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import type { Tone } from '@/crm/ads-rules';
import { formatChange } from '@/crm/ads-rules';

/**
 * As peças das telas de números do CRM (Anúncios e Painel): cartão de número,
 * minilinha, barras em lista e a moldura dos gráficos. Tudo desenhado aqui, sem
 * biblioteca de gráficos. As cores das marcas vêm de `--viz-*` (globals.css);
 * texto e números ficam sempre nas cores de texto.
 */

export const CARD = 'rounded-xl border border-border/70 bg-surface shadow-[0_1px_2px_rgba(15,30,60,0.05)]';

// ─── Dica: explica o número em uma frase (mouse, teclado e toque) ────────────

/** `anchored`: a dica se alinha ao cartão em volta (que precisa ser `relative`), para não sair da tela. */
export function Hint({ text, label, anchored = false }: { text: string; label: string; anchored?: boolean }) {
  return (
    <span className={`group/hint inline-flex ${anchored ? "" : "relative"}`}>
      <button
        type="button"
        aria-label={`O que é ${label}?`}
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-20 rounded-lg ${anchored ? "inset-x-2 top-11" : "right-0 top-full mt-1 w-56"} border border-border bg-popover px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-focus-within/hint:opacity-100 group-hover/hint:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
}

// ─── Variação contra o período anterior ──────────────────────────────────────

const TONE: Record<Tone, string> = {
  good: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  bad: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  neutral: 'bg-surface-alt text-muted-foreground',
};

export function Delta({ change, tone, versus }: { change: number | null; tone: Tone; versus: string }) {
  if (change == null) {
    return (
      <span className="text-xs text-muted-foreground" title={`Sem dados em ${versus} para comparar`}>
        sem comparação
      </span>
    );
  }
  const parado = Math.abs(change) < 0.005;
  const Icon = parado ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const fala = parado ? 'igual a' : `${change > 0 ? 'subiu' : 'caiu'} ${formatChange(change).slice(1)} contra`;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${TONE[tone]}`} title={`Comparado com ${versus}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span aria-hidden="true">{parado ? '0%' : formatChange(change)}</span>
      <span className="sr-only">
        {fala} {versus}
        {tone === 'good' ? ' (melhorou)' : tone === 'bad' ? ' (piorou)' : ''}
      </span>
    </span>
  );
}

// ─── Minilinha ───────────────────────────────────────────────────────────────

/** A tendência do número no período. Decorativa: o valor e a variação estão escritos ao lado. */
export function Sparkline({ values, color = 'var(--viz-meta)' }: { values: readonly (number | null)[]; color?: string }) {
  const pontos = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pontos.length < 2) return null;
  const [w, h, pad] = [72, 28, 4];
  const [min, max] = [Math.min(...pontos.map((p) => p.v)), Math.max(...pontos.map((p) => p.v))];
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2));
  const linha = pontos.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const fim = pontos[pontos.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0 overflow-visible">
      <path d={linha} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/45" />
      <circle cx={x(fim.i)} cy={y(fim.v)} r="4" fill={color} stroke="hsl(var(--surface))" strokeWidth="2" />
    </svg>
  );
}

// ─── Cartão de número ────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  hint,
  change,
  tone = 'neutral',
  versus,
  trend,
  trendColor,
  detail,
  index = 0,
  lead = false,
}: {
  label: string;
  /** Já formatado; "–" quando não há como calcular. */
  value: string;
  /** Uma frase simples dizendo o que o número significa. */
  hint: string;
  change?: number | null;
  tone?: Tone;
  /** Com o que compara ("os 30 dias anteriores"). Sem isto, não mostra variação. */
  versus?: string;
  trend?: readonly (number | null)[];
  trendColor?: string;
  detail?: string;
  index?: number;
  /** O número principal da tela: maior. */
  lead?: boolean;
}) {
  return (
    <li className={`${CARD} viz-rise relative flex min-w-0 flex-col justify-between gap-3 p-4`} style={{ '--i': index } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-tight text-muted-foreground">{label}</p>
        <Hint text={hint} label={label} anchored />
      </div>
      <div className="min-w-0">
        <p className={`whitespace-nowrap font-semibold tracking-tight text-foreground ${lead ? 'text-[2rem] leading-none sm:text-[2.5rem]' : 'text-[1.6rem] leading-none'}`}>
          {value}
        </p>
        {detail && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{detail}</p>}
      </div>
      {(versus !== undefined || trend) && (
        <div className="flex min-h-[28px] items-center justify-between gap-2">
          {versus !== undefined ? <Delta change={change ?? null} tone={tone} versus={versus} /> : <span />}
          {trend && (
            <span className={lead ? "" : "hidden sm:block"}>
              <Sparkline values={trend} color={trendColor} />
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Moldura de gráfico, com a versão em tabela ──────────────────────────────

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className = '',
  index = 0,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  /** Os mesmos números em tabela: para leitor de tela e para quem prefere ler. */
  table?: TableData;
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <section aria-label={title} className={`${CARD} viz-rise min-w-0 p-4 sm:p-5 ${className}`} style={{ '--i': index } as React.CSSProperties}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {legend}
      </header>
      {children}
      {table && table.rows.length > 0 && (
        <details className="group mt-4 border-t border-border/70 pt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Ver em tabela</span>
            <span className="hidden group-open:inline">Esconder tabela</span>
          </summary>
          <div className="relative mt-2 max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  {table.columns.map((c, i) => (
                    <th key={c} scope="col" className={`sticky top-0 bg-surface py-1.5 font-medium ${i ? 'text-right' : ''}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) =>
                      j === 0 ? (
                        <th key={j} scope="row" className="py-1.5 text-left font-normal">
                          {v}
                        </th>
                      ) : (
                        <td key={j} className="py-1.5 text-right tabular-nums">
                          {v}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

/** Legenda: a marca colorida ao lado do nome (o texto não usa a cor). */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

// ─── Barras em lista (categorias sem ordem: uma cor só, a maior primeiro) ────

export interface BarItem {
  label: string;
  value: number;
  /** O número escrito na ponta ("72"). */
  display: string;
  /** Um complemento em cinza ("39% · 8 fecharam"). */
  note?: string;
}

export function BarList({ items, empty, color = 'var(--viz-meta)' }: { items: BarItem[]; empty: string; color?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const maior = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i, k) => (
        <li key={i.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium">{i.display}</span>
              {i.note && <span className="text-muted-foreground"> · {i.note}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-surface-alt" aria-hidden="true">
            <div
              className="viz-grow-x h-full rounded-full"
              style={{ width: `${Math.max(i.value > 0 ? 1.5 : 0, (i.value / maior) * 100)}%`, background: color, animationDelay: `${k * 40}ms` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Estado vazio ────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${CARD} viz-rise mx-auto flex max-w-xl flex-col items-start gap-3 p-6 sm:p-8`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
        {icon}
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="max-w-prose space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
      {action && <div className="mt-1 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
