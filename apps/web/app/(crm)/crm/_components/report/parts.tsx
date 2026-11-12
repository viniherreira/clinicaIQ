import type { CSSProperties, ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import type { Tone } from '@/crm/ads-rules';
import { formatChange } from '@/crm/ads-rules';
import { CountUp, type NumFormat } from './charts';
import { glow, smoothPath } from './viz-math';

/**
 * As peças das telas de números do CRM (Anúncios e Painel): cartão de número,
 * minilinha, anel, barras em lista, pirâmide de idade e a moldura dos gráficos.
 * Tudo desenhado aqui, sem biblioteca de gráficos. As cores das marcas vêm de
 * `--viz-*` (globals.css); texto e números ficam sempre nas cores de texto.
 */

export const CARD = 'viz-card';

const accent = (color?: string, extra?: CSSProperties) => ({ ...(color ? { '--viz-accent': color } : {}), ...extra }) as CSSProperties;

// ─── Dica: explica o número em uma frase (mouse, teclado e toque) ────────────

/** `anchored`: a dica se alinha ao cartão em volta (que precisa ser `relative`), para não sair da tela. */
export function Hint({ text, label, anchored = false }: { text: string; label: string; anchored?: boolean }) {
  return (
    <span className={`group/hint inline-flex ${anchored ? '' : 'relative'}`}>
      <button
        type="button"
        aria-label={`O que é ${label}?`}
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-30 rounded-xl ${anchored ? 'inset-x-2 top-11' : 'right-0 top-full mt-1 w-56'} border border-border bg-popover px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-popover-foreground opacity-0 shadow-xl transition-opacity duration-150 group-focus-within/hint:opacity-100 group-hover/hint:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
}

// ─── Variação contra o período anterior ──────────────────────────────────────

const TONE: Record<Tone, string> = {
  good: 'bg-green-500/15 text-green-800 ring-1 ring-inset ring-green-600/25 dark:text-green-300 dark:ring-green-400/25',
  bad: 'bg-red-500/15 text-red-800 ring-1 ring-inset ring-red-600/25 dark:text-red-300 dark:ring-red-400/25',
  neutral: 'bg-foreground/[0.06] text-muted-foreground ring-1 ring-inset ring-foreground/10',
};

export function Delta({ change, tone, versus }: { change: number | null; tone: Tone; versus: string }) {
  if (change == null) {
    return (
      <span className="text-[11px] text-muted-foreground" title={`Sem dados em ${versus} para comparar`}>
        sem comparação
      </span>
    );
  }
  const parado = Math.abs(change) < 0.005;
  const Icon = parado ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const fala = parado ? 'igual a' : `${change > 0 ? 'subiu' : 'caiu'} ${formatChange(change).slice(1)} contra`;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums ${TONE[tone]}`} title={`Comparado com ${versus}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span aria-hidden="true">{parado ? '0%' : formatChange(change)}</span>
      <span className="sr-only">
        {fala} {versus}
        {tone === 'good' ? ' (melhorou)' : tone === 'bad' ? ' (piorou)' : ''}
      </span>
    </span>
  );
}

// ─── Minilinha com área ──────────────────────────────────────────────────────

/**
 * A tendência do número no período. Decorativa: o valor e a variação estão
 * escritos ao lado. `bleed`: ocupa a largura toda do cartão, colada embaixo.
 */
export function Sparkline({ values, color = 'var(--viz-meta)', bleed = false, id }: { values: readonly (number | null)[]; color?: string; bleed?: boolean; id: string }) {
  const pontos = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pontos.length < 2) return null;
  const [w, h] = bleed ? [100, 100] : [84, 30];
  const pad = bleed ? 6 : 4;
  const [min, max] = [Math.min(...pontos.map((p) => p.v)), Math.max(...pontos.map((p) => p.v))];
  const x = (i: number) => (bleed ? (i / (values.length - 1)) * w : pad + (i / (values.length - 1)) * (w - pad * 2));
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2 - (bleed ? 30 : 0)));
  const xy = pontos.map((p) => [x(p.i), y(p.v)] as const);
  const linha = smoothPath(xy);
  const area = `${linha} L${xy[xy.length - 1][0].toFixed(2)} ${h} L${xy[0][0].toFixed(2)} ${h} Z`;
  const fim = xy[xy.length - 1];
  const grad = `spark-${id}`;
  if (bleed) {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] w-full rounded-b-[15px]">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${grad})`} className="viz-reveal" />
        <path d={linha} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="viz-draw" style={{ filter: `drop-shadow(${glow(color, 6)})` }} />
      </svg>
    );
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${grad})`} />
      <path d={linha} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="viz-draw" />
      <circle cx={fim[0]} cy={fim[1]} r="3.5" fill={color} stroke="hsl(var(--surface))" strokeWidth="2" style={{ filter: `drop-shadow(${glow(color, 5)})` }} />
    </svg>
  );
}

// ─── Anel: uma taxa de 0 a 100% ──────────────────────────────────────────────

/** Decorativo: a taxa está escrita ao lado. */
export function Ring({ value, color = 'var(--viz-meta)', size = 52 }: { value: number | null; color?: string; size?: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const parte = Math.min(1, Math.max(0, value ?? 0));
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--foreground) / 0.08)" strokeWidth="5" />
      {parte > 0 && (
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(parte * c).toFixed(2)} ${c.toFixed(2)}`}
          style={{ filter: `drop-shadow(${glow(color, 4)})`, transition: 'stroke-dasharray 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      )}
    </svg>
  );
}

// ─── Cartão de número ────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  format,
  hint,
  change,
  tone = 'neutral',
  versus,
  trend,
  color = 'var(--viz-meta)',
  ring,
  detail,
  index = 0,
  lead = false,
  className = '',
}: {
  label: string;
  /** O número cru (centavos, unidades, taxa de 0 a 1…); nulo mostra "–". */
  value: number | null;
  format: NumFormat;
  /** Uma frase simples dizendo o que o número significa. */
  hint: string;
  change?: number | null;
  tone?: Tone;
  /** Com o que compara ("os 30 dias anteriores"). Sem isto, não mostra variação. */
  versus?: string;
  trend?: readonly (number | null)[];
  /** A cor da marca deste cartão (fio de luz, minilinha, anel). */
  color?: string;
  /** Mostra um anel com esta taxa (0 a 1) no lugar da minilinha. */
  ring?: number | null;
  detail?: string;
  index?: number;
  /** O número principal da tela: maior, com a curva ao fundo. */
  lead?: boolean;
  /** Quantas colunas da grade o cartão ocupa. */
  className?: string;
}) {
  const id = label.replace(/[^a-z0-9]/gi, '').toLowerCase() + index;
  return (
    <li className={`${CARD} viz-rise group relative flex min-w-0 flex-col justify-between gap-3 overflow-hidden p-4 ${lead ? 'min-h-[168px] sm:p-5' : ''} ${className}`} style={accent(color, { '--i': index } as CSSProperties)}>
      {lead && trend && <Sparkline values={trend} color={color} bleed id={id} />}
      <div className="relative flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase leading-tight tracking-[0.08em] text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color, boxShadow: glow(color, 8) }} aria-hidden="true" />
          {label}
        </p>
        <Hint text={hint} label={label} anchored />
      </div>
      <div className="relative flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className={`viz-num whitespace-nowrap text-foreground ${lead ? 'text-[2.1rem] leading-none sm:text-[2.75rem]' : 'text-[1.15rem] leading-none min-[420px]:text-[1.35rem] sm:text-[1.55rem]'}`}>
            <CountUp value={value} format={format} />
          </p>
          {detail && <p className="mt-2 text-xs leading-snug text-muted-foreground">{detail}</p>}
        </div>
        {ring !== undefined && <Ring value={ring} color={color} />}
      </div>
      {(versus !== undefined || (trend && !lead)) && (
        <div className="relative flex min-h-[30px] items-center justify-between gap-2">
          {versus !== undefined ? <Delta change={change ?? null} tone={tone} versus={versus} /> : <span />}
          {trend && !lead && (
            <span className="hidden sm:block">
              <Sparkline values={trend} color={color} id={id} />
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
  eyebrow,
  subtitle,
  legend,
  table,
  children,
  className = '',
  color,
  index = 0,
}: {
  title: string;
  /** Uma etiqueta curta acima do título ("Meta", "CRM"). */
  eyebrow?: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  /** Os mesmos números em tabela: para leitor de tela e para quem prefere ler. */
  table?: TableData;
  children: ReactNode;
  className?: string;
  color?: string;
  index?: number;
}) {
  return (
    <section aria-label={title} className={`${CARD} viz-rise min-w-0 p-4 sm:p-5 ${className}`} style={accent(color, { '--i': index } as CSSProperties)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>}
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {legend}
      </header>
      {children}
      {table && table.rows.length > 0 && (
        <details className="group mt-4 border-t border-border/60 pt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
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
          <span className="h-2 w-2 rounded-full" style={{ background: i.color, boxShadow: glow(i.color, 6) }} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

// ─── Destaque: uma descoberta em uma linha ───────────────────────────────────

export function Insight({ icon, label, value, note, color = 'var(--viz-meta)', index = 0 }: { icon: ReactNode; label: string; value: string; note?: string; color?: string; index?: number }) {
  return (
    <li className={`${CARD} viz-rise flex min-w-0 items-center gap-3 p-3.5`} style={accent(color, { '--i': index } as CSSProperties)}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color: 'hsl(var(--foreground))', boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)` }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <span className="block truncate text-[15px] font-semibold tracking-tight">{value}</span>
        {note && <span className="block text-xs leading-snug text-muted-foreground">{note}</span>}
      </span>
    </li>
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

export function BarList({ items, empty, color = 'var(--viz-meta)', ranked = true }: { items: BarItem[]; empty: string; color?: string; ranked?: boolean }) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  const maior = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3.5">
      {items.map((i, k) => (
        <li key={i.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              {ranked && <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{String(k + 1).padStart(2, '0')}</span>}
              <span className="truncate">{i.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-mono text-[13px] font-semibold">{i.display}</span>
              {i.note && <span className="text-xs text-muted-foreground"> · {i.note}</span>}
            </span>
          </div>
          <div className="viz-track mt-1.5 h-2 overflow-hidden rounded-full" aria-hidden="true">
            <div
              className="viz-grow-x h-full rounded-full"
              style={{
                width: `${Math.max(i.value > 0 ? 1.5 : 0, (i.value / maior) * 100)}%`,
                background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
                boxShadow: glow(color, 8),
                animationDelay: `${k * 50}ms`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Pirâmide: idade e gênero, lado a lado ───────────────────────────────────

export function AgePyramid({
  rows,
  unit,
  female = 'var(--viz-crm)',
  male = 'var(--viz-meta)',
}: {
  rows: { label: string; female: number; male: number }[];
  /** O que os números contam ("conversas"). */
  unit: string;
  female?: string;
  male?: string;
}) {
  const maior = Math.max(1, ...rows.flatMap((r) => [r.female, r.male]));
  const barra = (v: number, cor: string, lado: 'l' | 'r', k: number) => (
    <span className={`flex items-center gap-2 ${lado === 'l' ? 'flex-row-reverse' : ''}`}>
      <span className="viz-track h-3.5 flex-1 overflow-hidden rounded-full" aria-hidden="true">
        <span
          className={`viz-grow-x block h-full rounded-full ${lado === 'l' ? 'ml-auto' : ''}`}
          style={{
            width: `${Math.max(v > 0 ? 2 : 0, (v / maior) * 100)}%`,
            background: `linear-gradient(${lado === 'l' ? 270 : 90}deg, color-mix(in srgb, ${cor} 55%, transparent), ${cor})`,
            boxShadow: glow(cor, 8),
            transformOrigin: lado === 'l' ? 'right' : 'left',
            animationDelay: `${k * 50}ms`,
          }}
        />
      </span>
      <span className="w-9 shrink-0 font-mono text-xs tabular-nums" style={{ textAlign: lado === 'l' ? 'right' : 'left' }}>
        {v.toLocaleString('pt-BR')}
      </span>
    </span>
  );
  return (
    <div role="img" aria-label={`${unit} por idade e gênero: ${rows.map((r) => `${r.label}, ${r.female} mulheres e ${r.male} homens`).join('; ')}`}>
      <div className="mb-2 grid grid-cols-[1fr_5.75rem_1fr] items-center text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground" aria-hidden="true">
        <span className="flex items-center justify-end gap-1.5">
          Mulheres <span className="h-2 w-2 rounded-full" style={{ background: female, boxShadow: glow(female, 6) }} />
        </span>
        <span className="text-center font-mono text-[10px]">idade</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: male, boxShadow: glow(male, 6) }} /> Homens
        </span>
      </div>
      <ul className="space-y-2" aria-hidden="true">
        {rows.map((r, k) => (
          <li key={r.label} className="grid grid-cols-[1fr_5.75rem_1fr] items-center">
            {barra(r.female, female, 'l', k)}
            <span className="whitespace-nowrap text-center font-mono text-xs text-muted-foreground">{r.label}</span>
            {barra(r.male, male, 'r', k)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Uma barra só, dividida em partes (até umas 4), com a legenda embaixo. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  const visiveis = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div
        className="flex h-3.5 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={visiveis.map((p) => `${p.label}: ${Math.round((p.value / total) * 100)}%`).join(', ')}
      >
        {visiveis.map((p) => (
          <span key={p.label} className="viz-grow-x h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color, boxShadow: glow(p.color, 8) }} />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {visiveis.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
            {p.label}
            <span className="font-mono font-semibold text-foreground">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Estado vazio ────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${CARD} viz-rise mx-auto flex max-w-xl flex-col items-start gap-3 p-6 sm:p-8`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/25" aria-hidden="true">
        {icon}
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="max-w-prose space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
      {action && <div className="mt-1 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
