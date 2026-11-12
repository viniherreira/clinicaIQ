'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatCount, formatMoney, formatRate, formatRoas } from '@/crm/ads-rules';
import { formatMinutes } from '@/crm/dashboard-math';
import { formatCents } from '@/crm/format';
import { glow, smoothPath } from './viz-math';

/**
 * Os gráficos com interação das telas de números: número que conta, área,
 * colunas e mapa de calor. Desenhados aqui (sem biblioteca): esticam com a
 * tela sem distorcer o texto. Passar o mouse, tocar ou usar as setas do
 * teclado mostra o valor; os mesmos números estão sempre na tabela do cartão
 * (`ChartCard`). Quem pediu menos movimento não vê animação.
 */

// ─── Número que conta até o valor ────────────────────────────────────────────

/** Como o número cru vira texto. Dinheiro chega em centavos; taxa, de 0 a 1. */
export type NumFormat = 'money' | 'money0' | 'count' | 'rate' | 'roas' | 'minutes' | 'days';

function show(v: number, f: NumFormat): string {
  if (f === 'money') return formatMoney(Math.round(v));
  if (f === 'money0') return formatCents(Math.round(v));
  if (f === 'rate') return formatRate(v);
  if (f === 'roas') return formatRoas(v);
  if (f === 'minutes') return formatMinutes(Math.round(v));
  if (f === 'days') {
    const d = Math.round(v * 10) / 10;
    return `${d.toLocaleString('pt-BR', { maximumFractionDigits: d < 10 ? 1 : 0 })} ${d === 1 ? 'dia' : 'dias'}`;
  }
  return formatCount(Math.round(v));
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function CountUp({ value, format }: { value: number | null; format: NumFormat }) {
  const [shown, setShown] = useState(value);
  const from = useRef<number>(0);
  useIsoLayoutEffect(() => {
    if (value == null) return setShown(null);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      from.current = value;
      return setShown(value);
    }
    const [a, b, t0, dur] = [from.current, value, performance.now(), 900];
    let raf = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - (1 - p) ** 4;
      setShown(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(passo);
      else from.current = b;
    };
    setShown(a);
    raf = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(raf);
      from.current = b;
    };
  }, [value]);
  if (value == null || shown == null) return <span className="text-muted-foreground">–</span>;
  return (
    <>
      <span aria-hidden="true">{show(shown, format)}</span>
      <span className="sr-only">{show(value, format)}</span>
    </>
  );
}

// ─── Eixo e teclado ──────────────────────────────────────────────────────────

export type ValueFormat = 'count' | 'money';

const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const num = new Intl.NumberFormat('pt-BR');

/** Valores chegam inteiros: centavos em 'money', unidades em 'count'. */
const fmt = (v: number, f: ValueFormat) => (f === 'money' ? brl2.format(v / 100) : num.format(v));
const fmtAxis = (v: number, f: ValueFormat) => (f === 'money' ? brl0.format(v / 100) : num.format(v));

/** O topo do eixo: o próximo número "redondo" acima do maior valor. */
export function niceMax(max: number, f: ValueFormat): number {
  const alvo = f === 'money' ? max / 100 : max;
  if (alvo <= 0) return f === 'money' ? 1000 : 4;
  const base = 10 ** Math.floor(Math.log10(alvo));
  const passo = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((p) => p * base >= alvo) ?? 10;
  const topo = Math.max(passo * base, f === 'count' ? 4 : 0);
  return f === 'money' ? Math.round(topo * 100) : topo;
}

export interface Series {
  name: string;
  /** Cor da marca (uma variável `--viz-*`). */
  color: string;
  values: number[];
  format: ValueFormat;
}

type Control = { active: number | null; onActive: (i: number | null) => void };

/** Leva o foco das setas do teclado de um ponto a outro. */
function useActive(total: number, controlled?: Control) {
  const [own, setOwn] = useState<number | null>(null);
  const active = controlled ? controlled.active : own;
  const setActive = controlled ? controlled.onActive : setOwn;
  const onKeyDown = (e: KeyboardEvent) => {
    if (total === 0) return;
    const atual = active ?? -1;
    if (e.key === 'ArrowRight') setActive(Math.min(total - 1, atual + 1));
    else if (e.key === 'ArrowLeft') setActive(Math.max(0, atual <= 0 ? 0 : atual - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(total - 1);
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };
  return { active, setActive, onKeyDown };
}

function Axis({ topo, formato, height }: { topo: number; formato: ValueFormat; height: number }) {
  return (
    <div className="relative w-11 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground/80" style={{ height }} aria-hidden="true">
      {[1, 0.5, 0].map((p) => (
        <span key={p} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${(1 - p) * 100}%` }}>
          {fmtAxis(topo * p, formato)}
        </span>
      ))}
    </div>
  );
}

function Grid() {
  return (
    <>
      {[1, 0.5, 0].map((p) => (
        <span key={p} className="absolute inset-x-0 h-px" style={{ top: `${(1 - p) * 100}%`, background: p === 0 ? 'hsl(var(--border-strong))' : 'var(--viz-grid)' }} aria-hidden="true" />
      ))}
    </>
  );
}

function Tooltip({ id, lado, left, title, rows }: { id: string; lado: 'left' | 'right' | 'center'; left: number; title: string; rows: { color: string; value: string; name: string }[] }) {
  return (
    <div
      id={id}
      role="status"
      className="pointer-events-none absolute bottom-full z-20 mb-2 min-w-[9.5rem] rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={lado === 'left' ? { left: 0 } : lado === 'right' ? { right: 0 } : { left: `${left}%`, transform: 'translateX(-50%)' }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="mt-1 flex items-center gap-2 whitespace-nowrap">
          <span className="h-[3px] w-3 rounded-full" style={{ background: r.color, boxShadow: glow(r.color, 6) }} aria-hidden="true" />
          <span className="font-mono font-semibold tabular-nums text-popover-foreground">{r.value}</span>
          <span className="text-muted-foreground">{r.name}</span>
        </p>
      ))}
    </div>
  );
}

const sideOf = (i: number, n: number) => (n <= 1 ? 'center' : i / (n - 1) < 0.22 ? 'left' : i / (n - 1) > 0.78 ? 'right' : 'center');

/** Os rótulos do eixo de baixo: uns 6, espalhados por igual, para não encavalar. */
function tickIndexes(n: number, max = 6): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: max }, (_, k) => Math.round((k * (n - 1)) / (max - 1)));
}

// ─── Área: uma série ao longo do tempo ───────────────────────────────────────

export function AreaChart({
  points,
  series,
  height = 132,
  label,
  showTicks = true,
  control,
}: {
  points: { label: string; tick: string }[];
  series: Series;
  height?: number;
  /** O que o gráfico mostra, para o leitor de tela. */
  label: string;
  showTicks?: boolean;
  /** Para vários gráficos alinhados acenderem o mesmo dia juntos. */
  control?: Control;
}) {
  const id = useId().replace(/:/g, '');
  const n = points.length;
  const { active, setActive, onKeyDown } = useActive(n, control);
  const topo = niceMax(Math.max(0, ...series.values), series.format);
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (Math.max(0, v) / topo) * 100;
  const xy = series.values.slice(0, n).map((v, i) => [x(i), y(v)] as const);
  const linha = smoothPath(xy);
  const area = n > 1 ? `${linha} L100 100 L0 100 Z` : '';
  const cor = series.color;
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || n === 0) return;
    setActive(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const ultimo = n - 1;
  const ponto = active ?? ultimo;

  return (
    <div className="flex gap-2">
      <Axis topo={topo} formato={series.format} height={height} />
      <div className="min-w-0 flex-1">
        {/* Gráfico navegável: o grupo recebe o foco e as setas percorrem os pontos. Os mesmos números estão na tabela do cartão. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          role="group"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label={`${label}. Use as setas para percorrer os pontos.`}
          aria-describedby={active != null ? `${id}-tip` : undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerMove={mover}
          onPointerDown={mover}
          onPointerLeave={() => setActive(null)}
          className="relative cursor-crosshair touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          style={{ height }}
        >
          <Grid />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={cor} stopOpacity="0.38" />
                <stop offset="0.6" stopColor={cor} stopOpacity="0.1" />
                <stop offset="1" stopColor={cor} stopOpacity="0" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill={`url(#${id}-g)`} className="viz-reveal" />}
            {n > 1 && (
              <path
                d={linha}
                fill="none"
                stroke={cor}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="viz-draw"
                style={{ filter: `drop-shadow(${glow(cor, 7)})` }}
              />
            )}
          </svg>
          {active != null && <span className="absolute inset-y-0 w-px -translate-x-1/2" style={{ left: `${x(active)}%`, background: `linear-gradient(180deg, transparent, ${cor}, transparent)` }} aria-hidden="true" />}
          {n > 0 && (
            <span className="absolute h-0 w-0" style={{ left: `${x(ponto)}%`, top: `${y(series.values[ponto] ?? 0)}%` }} aria-hidden="true">
              {active == null && <span className="viz-ping absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full" style={{ background: cor }} />}
              <span className="absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full" style={{ background: cor, boxShadow: `0 0 0 2.5px hsl(var(--surface)), ${glow(cor, 12)}` }} />
            </span>
          )}
          {active != null && points[active] && (
            <Tooltip
              id={`${id}-tip`}
              lado={sideOf(active, n)}
              left={x(active)}
              title={points[active].label}
              rows={[{ color: cor, value: fmt(series.values[active] ?? 0, series.format), name: series.name }]}
            />
          )}
        </div>
        {showTicks && (
          <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground/80" aria-hidden="true">
            {tickIndexes(n).map((i) => (
              <span key={i} className="whitespace-nowrap">
                {points[i]?.tick}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Vários gráficos de área, um embaixo do outro, com os mesmos dias: o mesmo dia acende em todos. */
export function StackedCharts({ points, charts }: { points: { label: string; tick: string }[]; charts: { title: string; total?: string; series: Series }[] }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="space-y-6">
      {charts.map((c, k) => (
        <div key={c.title}>
          <p className="mb-2.5 flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: c.series.color, boxShadow: glow(c.series.color, 6) }} aria-hidden="true" />
              {c.title}
            </span>
            {c.total && <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{c.total}</span>}
          </p>
          <AreaChart points={points} series={c.series} height={104} label={c.title} showTicks={k === charts.length - 1} control={{ active, onActive: setActive }} />
        </div>
      ))}
    </div>
  );
}

// ─── Colunas ─────────────────────────────────────────────────────────────────

export function ColumnChart({
  points,
  series,
  height = 168,
  label,
  showTicks = true,
  control,
  peak = false,
  maxTicks = 8,
}: {
  points: { label: string; tick: string }[];
  /** Uma ou mais séries na MESMA escala (nunca dois eixos). */
  series: Series[];
  height?: number;
  /** O que o gráfico mostra, para o leitor de tela. */
  label: string;
  showTicks?: boolean;
  control?: Control;
  /** Destaca a coluna mais alta e apaga um pouco as outras. */
  peak?: boolean;
  maxTicks?: number;
}) {
  const id = useId().replace(/:/g, '');
  const n = points.length;
  const { active, setActive, onKeyDown } = useActive(n, control);
  const formato = series[0]?.format ?? 'count';
  const maior = Math.max(0, ...series.flatMap((s) => s.values));
  const topo = niceMax(maior, formato);
  const pico = peak && maior > 0 ? (series[0]?.values.indexOf(maior) ?? -1) : -1;
  const cada = Math.max(1, Math.ceil(n / maxTicks));
  // O rótulo do pico sempre aparece; os vizinhos dele saem para não encavalar.
  const rotulo = (i: number, passo: number) => pico === i || (i % passo === 0 && (pico < 0 || Math.abs(i - pico) >= passo));
  // Com muitos rótulos, o celular mostra metade.
  const denso = n / cada > 8;

  return (
    <div className="flex gap-2">
      <Axis topo={topo} formato={formato} height={height} />
      <div className="min-w-0 flex-1">
        {/* Gráfico navegável: o grupo recebe o foco e as setas percorrem os pontos. Os mesmos números estão na tabela do cartão. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          role="group"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label={`${label}. Use as setas para percorrer os pontos.`}
          aria-describedby={active != null ? `${id}-tip` : undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          style={{ height }}
        >
          <Grid />
          <div className="absolute inset-0 flex items-stretch">
            {points.map((p, i) => {
              const aceso = active === i || (active == null && pico === i);
              const apagado = active != null ? active !== i : pico >= 0 && pico !== i;
              return (
                <div
                  key={i}
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={() => setActive(i)}
                  className={`flex min-w-0 flex-1 items-end justify-center gap-[2px] px-[1.5px] transition-colors duration-100 ${active === i ? 'bg-foreground/[0.05]' : ''}`}
                >
                  {series.map((s) => {
                    const v = s.values[i] ?? 0;
                    return (
                      <span
                        key={s.name}
                        className="viz-grow-y block w-full max-w-[22px] rounded-t-[5px] transition-[opacity,box-shadow] duration-150"
                        style={{
                          height: `${Math.max(v > 0 ? 2 : 0, (v / topo) * 100)}%`,
                          background: `linear-gradient(180deg, ${s.color}, color-mix(in srgb, ${s.color} 45%, transparent))`,
                          boxShadow: aceso ? glow(s.color, 14) : 'none',
                          opacity: apagado ? 0.42 : 1,
                          animationDelay: `${Math.min(i * 14, 420)}ms`,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
          {active != null && points[active] && (
            <Tooltip
              id={`${id}-tip`}
              lado={sideOf(active, n)}
              left={((active + 0.5) / n) * 100}
              title={points[active].label}
              rows={series.map((s) => ({ color: s.color, value: fmt(s.values[active] ?? 0, s.format), name: s.name }))}
            />
          )}
        </div>
        {showTicks && (
          <div className="mt-1.5 flex font-mono text-[10px] tabular-nums text-muted-foreground/80" aria-hidden="true">
            {points.map((p, i) => (
              <span key={i} className={`min-w-0 flex-1 text-center ${pico === i ? 'font-semibold text-foreground' : ''}`}>
                {rotulo(i, cada) ? <span className={`whitespace-nowrap ${!denso || rotulo(i, cada * 2) ? 'inline-block' : 'hidden sm:inline-block'}`}>{p.tick}</span> : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mapa de calor: dia da semana × hora ─────────────────────────────────────

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_LONGOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** Em qual dos 5 tons o valor cai (0 = vazio). */
export const heatStep = (v: number, max: number) => (v <= 0 || max <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((v / max) * 5))));

export function Heatmap({ cells, unit = 'leads' }: { cells: number[][]; unit?: string }) {
  const id = useId().replace(/:/g, '');
  const [active, setActive] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(0, ...cells.flat());
  let pico: { d: number; h: number } | null = null;
  cells.forEach((dia, d) => dia.forEach((v, h) => (max > 0 && v === max && !pico ? (pico = { d, h }) : null)));
  const mover = (e: KeyboardEvent) => {
    const a = active ?? pico ?? { d: 0, h: 8 };
    const passos: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (e.key === 'Escape') return setActive(null);
    const p = passos[e.key];
    if (!p) return;
    e.preventDefault();
    setActive(active ? { d: Math.min(6, Math.max(0, a.d + p[0])), h: Math.min(23, Math.max(0, a.h + p[1])) } : a);
  };
  const v = active ? cells[active.d]?.[active.h] ?? 0 : 0;
  const tom = (p: number) => (p === 0 ? 'hsl(var(--foreground) / 0.05)' : `var(--viz-seq-${p})`);

  return (
    <div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="group"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={`Mapa de calor: ${unit} por dia da semana e hora. Use as setas para percorrer.`}
        aria-describedby={`${id}-tip`}
        onKeyDown={mover}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <div className="grid grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-[2px] sm:gap-[3px]">
          {DIAS.map((dia, d) => (
            <div key={dia} className="contents">
              <span className={`self-center font-mono text-[10px] uppercase ${active?.d === d ? 'font-semibold text-foreground' : 'text-muted-foreground'}`} aria-hidden="true">
                {dia}
              </span>
              {Array.from({ length: 24 }, (_, h) => {
                const valor = cells[d]?.[h] ?? 0;
                const passo = heatStep(valor, max);
                const aceso = active?.d === d && active.h === h;
                const ehPico = pico?.d === d && pico.h === h;
                const naMira = active != null && (active.d === d || active.h === h);
                return (
                  <span
                    key={h}
                    onPointerEnter={() => setActive({ d, h })}
                    onPointerDown={() => setActive({ d, h })}
                    className={`relative aspect-square min-h-[10px] rounded-[4px] transition-[opacity,box-shadow] duration-100 ${aceso ? 'z-10 ring-2 ring-foreground ring-offset-1 ring-offset-surface' : ''}`}
                    style={{
                      background: tom(passo),
                      opacity: active != null && !naMira ? 0.45 : 1,
                      boxShadow: passo >= 4 ? glow(`var(--viz-seq-${passo})`, 8) : undefined,
                    }}
                  >
                    {ehPico && !active && <span className="viz-ping pointer-events-none absolute inset-0 rounded-[4px] ring-2 ring-foreground/70" />}
                  </span>
                );
              })}
            </div>
          ))}
          <span aria-hidden="true" />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className={`pt-1 text-center font-mono text-[9px] tabular-nums ${active?.h === h ? 'font-semibold text-foreground' : 'text-muted-foreground'}`} aria-hidden="true">
              {h % 3 === 0 || active?.h === h ? `${h}h` : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <p id={`${id}-tip`} role="status" className="min-h-[1.25rem]">
          {active ? (
            <>
              <span className="font-mono font-semibold text-foreground">
                {num.format(v)} {v === 1 ? unit.replace(/s$/, '') : unit}
              </span>{' '}
              · {DIAS_LONGOS[active.d]}, das {active.h}h às {active.h + 1}h
            </>
          ) : (
            'Passe o mouse ou toque num quadrado para ver o número.'
          )}
        </p>
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em]" aria-hidden="true">
          menos
          {[0, 1, 2, 3, 4, 5].map((p) => (
            <span key={p} className="h-3 w-3 rounded-[3px]" style={{ background: tom(p) }} />
          ))}
          mais
        </p>
      </div>
    </div>
  );
}
