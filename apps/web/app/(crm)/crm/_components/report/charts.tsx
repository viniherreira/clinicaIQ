'use client';

import { useId, useState, type KeyboardEvent } from 'react';

/**
 * Os gráficos com interação das telas de números: colunas e mapa de calor.
 * Desenhados em HTML e CSS (sem biblioteca): esticam com a tela sem distorcer
 * o texto. Passar o mouse, tocar ou usar as setas do teclado mostra o valor;
 * os mesmos números estão sempre na tabela do cartão (`ChartCard`).
 */

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

/** Leva o foco das setas do teclado de um ponto a outro. */
function useActive(total: number, controlled?: { active: number | null; onActive: (i: number | null) => void }) {
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

// ─── Colunas ─────────────────────────────────────────────────────────────────

export function ColumnChart({
  points,
  series,
  height = 168,
  label,
  showTicks = true,
  control,
}: {
  points: { label: string; tick: string }[];
  /** Uma ou mais séries na MESMA escala (nunca dois eixos). */
  series: Series[];
  height?: number;
  /** O que o gráfico mostra, para o leitor de tela. */
  label: string;
  showTicks?: boolean;
  /** Para vários gráficos alinhados acenderem o mesmo dia juntos. */
  control?: { active: number | null; onActive: (i: number | null) => void };
}) {
  const id = useId();
  const { active, setActive, onKeyDown } = useActive(points.length, control);
  const formato = series[0]?.format ?? 'count';
  const topo = niceMax(Math.max(0, ...series.flatMap((s) => s.values)), formato);
  const linhas = [1, 0.5, 0];
  // Rótulos do eixo de baixo: no máximo uns 6, para não encavalar.
  const cada = Math.max(1, Math.ceil(points.length / 6));
  const lado = active == null ? 'center' : active / Math.max(1, points.length - 1) < 0.25 ? 'left' : active / Math.max(1, points.length - 1) > 0.75 ? 'right' : 'center';

  return (
    <div className="flex gap-2">
      <div className="relative w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground" style={{ height }} aria-hidden="true">
        {linhas.map((p) => (
          <span key={p} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${(1 - p) * 100}%` }}>
            {fmtAxis(topo * p, formato)}
          </span>
        ))}
      </div>
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
          {linhas.map((p) => (
            <span key={p} className="absolute inset-x-0 h-px" style={{ top: `${(1 - p) * 100}%`, background: p === 0 ? 'hsl(var(--border-strong))' : 'var(--viz-grid)' }} aria-hidden="true" />
          ))}
          <div className="absolute inset-0 flex items-stretch">
            {points.map((p, i) => (
              <div
                key={i}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                className={`flex min-w-0 flex-1 items-end justify-center gap-[2px] px-[1px] transition-colors duration-100 ${active === i ? 'bg-foreground/[0.05]' : ''}`}
              >
                {series.map((s) => {
                  const v = s.values[i] ?? 0;
                  return (
                    <span
                      key={s.name}
                      className="viz-grow-y block w-full max-w-[24px] rounded-t-[4px] transition-opacity duration-100"
                      style={{
                        height: `${Math.max(v > 0 ? 1.5 : 0, (v / topo) * 100)}%`,
                        background: s.color,
                        opacity: active == null || active === i ? 1 : 0.45,
                        animationDelay: `${Math.min(i * 12, 360)}ms`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {active != null && points[active] && (
            <div
              id={`${id}-tip`}
              role="status"
              className="pointer-events-none absolute bottom-full z-10 mb-2 min-w-[9rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
              style={
                lado === 'left'
                  ? { left: 0 }
                  : lado === 'right'
                    ? { right: 0 }
                    : { left: `${((active + 0.5) / points.length) * 100}%`, transform: 'translateX(-50%)' }
              }
            >
              <p className="text-muted-foreground">{points[active].label}</p>
              {series.map((s) => (
                <p key={s.name} className="mt-1 flex items-center gap-2 whitespace-nowrap">
                  <span className="h-[3px] w-3 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                  <span className="font-semibold tabular-nums text-popover-foreground">{fmt(s.values[active] ?? 0, s.format)}</span>
                  <span className="text-muted-foreground">{s.name}</span>
                </p>
              ))}
            </div>
          )}
        </div>
        {showTicks && (
          <div className="mt-1.5 flex text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
            {points.map((p, i) => (
              <span key={i} className="min-w-0 flex-1 text-center">
                {i % cada === 0 ? <span className="inline-block whitespace-nowrap">{p.tick}</span> : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vários gráficos pequenos, um embaixo do outro, com os mesmos dias ───────

export function StackedCharts({ points, charts }: { points: { label: string; tick: string }[]; charts: { title: string; series: Series }[] }) {
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="space-y-5">
      {charts.map((c, k) => (
        <div key={c.title}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.series.color }} aria-hidden="true" />
            {c.title}
          </p>
          <ColumnChart
            points={points}
            series={[c.series]}
            height={104}
            label={c.title}
            showTicks={k === charts.length - 1}
            control={{ active, onActive: setActive }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Mapa de calor: dia da semana × hora ─────────────────────────────────────

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_LONGOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** Em qual dos 5 tons o valor cai (0 = vazio). */
export const heatStep = (v: number, max: number) => (v <= 0 || max <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((v / max) * 5))));

export function Heatmap({ cells, unit = 'leads' }: { cells: number[][]; unit?: string }) {
  const id = useId();
  const [active, setActive] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(0, ...cells.flat());
  const mover = (e: KeyboardEvent) => {
    const a = active ?? { d: 0, h: 8 };
    const passos: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (e.key === 'Escape') return setActive(null);
    const p = passos[e.key];
    if (!p) return;
    e.preventDefault();
    setActive(active ? { d: Math.min(6, Math.max(0, a.d + p[0])), h: Math.min(23, Math.max(0, a.h + p[1])) } : a);
  };
  const v = active ? cells[active.d]?.[active.h] ?? 0 : 0;

  return (
    <div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="group"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={`Mapa de calor: ${unit} por dia da semana e hora. Use as setas para percorrer.`}
        aria-describedby={active ? `${id}-tip` : undefined}
        onKeyDown={mover}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <div className="grid grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-[2px] sm:gap-[3px]">
          {DIAS.map((dia, d) => (
            <div key={dia} className="contents">
              <span className="self-center text-[11px] text-muted-foreground" aria-hidden="true">
                {dia}
              </span>
              {Array.from({ length: 24 }, (_, h) => {
                const valor = cells[d]?.[h] ?? 0;
                const passo = heatStep(valor, max);
                const aceso = active?.d === d && active.h === h;
                return (
                  <span
                    key={h}
                    onPointerEnter={() => setActive({ d, h })}
                    onPointerDown={() => setActive({ d, h })}
                    className={`aspect-square min-h-[10px] rounded-[3px] transition-shadow duration-100 ${aceso ? 'ring-2 ring-foreground ring-offset-1 ring-offset-surface' : ''}`}
                    style={{ background: passo === 0 ? 'hsl(var(--surface-alt))' : `var(--viz-seq-${passo})` }}
                  />
                );
              })}
            </div>
          ))}
          <span aria-hidden="true" />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="pt-1 text-center text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
              {h % 3 === 0 ? `${h}h` : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <p id={`${id}-tip`} role="status" className="min-h-[1.25rem]">
          {active ? (
            <>
              <span className="font-semibold text-foreground">
                {num.format(v)} {v === 1 ? unit.replace(/s$/, '') : unit}
              </span>{' '}
              · {DIAS_LONGOS[active.d]}, das {active.h}h às {active.h + 1}h
            </>
          ) : (
            'Passe o mouse ou toque num quadrado para ver o número.'
          )}
        </p>
        <p className="flex items-center gap-1.5" aria-hidden="true">
          menos
          {[0, 1, 2, 3, 4, 5].map((p) => (
            <span key={p} className="h-3 w-3 rounded-[3px]" style={{ background: p === 0 ? 'hsl(var(--surface-alt))' : `var(--viz-seq-${p})` }} />
          ))}
          mais
        </p>
      </div>
    </div>
  );
}
