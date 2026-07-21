'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setToothRecord } from '../actions';
import { ToothOutline, OcclusalView, toothTypeOf } from './tooth-shapes';

type ToothStatus = 'TO_TREAT' | 'IN_TREATMENT' | 'TREATED' | 'EXTRACTED' | 'MISSING';

interface ToothData {
  toothNumber: number;
  status: ToothStatus;
  note: string | null;
}

interface Props {
  patientId: string;
  teeth: ToothData[];
}

/** FDI notation, patient's right side first (as seen on a dental chart). */
const PERM_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const PERM_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const DECID_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const DECID_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const STATUS_META: Record<
  ToothStatus,
  { label: string; outline: string; fill: string; chip: string; number: string }
> = {
  TO_TREAT: {
    label: 'Precisa tratar',
    outline: 'stroke-red-500',
    fill: 'fill-red-100 dark:fill-red-950/70',
    chip: 'bg-red-500',
    number: 'text-red-600 dark:text-red-400',
  },
  IN_TREATMENT: {
    label: 'Em tratamento',
    outline: 'stroke-amber-500',
    fill: 'fill-amber-100 dark:fill-amber-950/70',
    chip: 'bg-amber-500',
    number: 'text-amber-600 dark:text-amber-400',
  },
  TREATED: {
    label: 'Tratado',
    outline: 'stroke-emerald-600',
    fill: 'fill-emerald-100 dark:fill-emerald-950/70',
    chip: 'bg-emerald-500',
    number: 'text-emerald-700 dark:text-emerald-400',
  },
  EXTRACTED: {
    label: 'Extraído',
    outline: 'stroke-slate-400 dark:stroke-slate-500',
    fill: 'fill-transparent',
    chip: 'bg-slate-500',
    number: 'text-muted-foreground line-through',
  },
  MISSING: {
    label: 'Ausente',
    outline: 'stroke-slate-300 dark:stroke-slate-600 [stroke-dasharray:3_2]',
    fill: 'fill-transparent',
    chip: 'bg-slate-300 dark:bg-slate-600',
    number: 'text-muted-foreground/50',
  },
};

const DEFAULT_OUTLINE = 'stroke-slate-400 dark:stroke-slate-500';
const STATUS_ORDER: ToothStatus[] = ['TO_TREAT', 'IN_TREATMENT', 'TREATED', 'EXTRACTED', 'MISSING'];

export function Odontogram({ patientId, teeth }: Props) {
  const router = useRouter();
  const [dentition, setDentition] = useState<'perm' | 'decid'>('perm');
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const byNumber = new Map(teeth.map((t) => [t.toothNumber, t]));
  const selectedData = selected != null ? byNumber.get(selected) : undefined;
  const marked = teeth.filter((t) => t.status === 'TO_TREAT' || t.status === 'IN_TREATMENT');

  function pick(n: number) {
    setSelected((cur) => (cur === n ? null : n));
    setNote(byNumber.get(n)?.note ?? '');
  }

  function apply(status: ToothStatus | null) {
    if (selected == null) return;
    startTransition(async () => {
      await setToothRecord(patientId, selected, status, status ? note : undefined);
      router.refresh();
      if (status === null) setSelected(null);
    });
  }

  function Tooth({ n, arch }: { n: number; arch: 'upper' | 'lower' }) {
    const data = byNumber.get(n);
    const meta = data ? STATUS_META[data.status] : null;
    const isSel = selected === n;
    const outline = meta?.outline ?? DEFAULT_OUTLINE;
    const fill = meta?.fill ?? 'fill-transparent';
    const crossed = data?.status === 'EXTRACTED';
    const type = toothTypeOf(n);

    const number = (
      <span className={`text-[10px] font-semibold tabular-nums sm:text-[11px] ${meta?.number ?? 'text-muted-foreground'}`}>
        {n}
      </span>
    );
    const outlineEl = (
      <ToothOutline
        type={type}
        flip={arch === 'lower'}
        outlineClass={outline}
        fillClass={fill}
        crossed={crossed}
        className="h-10 w-7 sm:h-12 sm:w-9"
      />
    );
    const occlusalEl = (
      <OcclusalView outlineClass={outline} fillClass={fill} className="h-5 w-5 sm:h-6 sm:w-6" />
    );

    return (
      <button
        type="button"
        onClick={() => pick(n)}
        aria-pressed={isSel}
        aria-label={`Dente ${n}${meta ? ` — ${meta.label}` : ''}${data?.note ? ` — ${data.note}` : ''}`}
        title={meta ? `${n} · ${meta.label}` : `Dente ${n}`}
        className={[
          'flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition-all',
          isSel ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-surface-alt',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        ].join(' ')}
      >
        {arch === 'upper' ? (
          <>
            {number}
            {outlineEl}
            {occlusalEl}
          </>
        ) : (
          <>
            {occlusalEl}
            {outlineEl}
            {number}
          </>
        )}
      </button>
    );
  }

  function Arch({ numbers, arch }: { numbers: number[]; arch: 'upper' | 'lower' }) {
    const mid = numbers.length / 2;
    return (
      <div className="overflow-x-auto pb-1">
        <div
          className="mx-auto flex w-max items-center gap-0.5 sm:gap-1"
          role="group"
          aria-label={arch === 'upper' ? 'Arcada superior' : 'Arcada inferior'}
        >
          {numbers.slice(0, mid).map((n) => <Tooth key={n} n={n} arch={arch} />)}
          <span className="mx-1.5 h-14 w-px self-center bg-border-strong sm:h-16" aria-hidden="true" />
          {numbers.slice(mid).map((n) => <Tooth key={n} n={n} arch={arch} />)}
        </div>
      </div>
    );
  }

  const upper = dentition === 'perm' ? PERM_UPPER : DECID_UPPER;
  const lower = dentition === 'perm' ? PERM_LOWER : DECID_LOWER;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
        {/* Dentition toggle */}
        <div className="flex justify-center">
          <div className="segmented" role="group" aria-label="Dentição">
            <button
              type="button"
              onClick={() => { setDentition('perm'); setSelected(null); }}
              aria-pressed={dentition === 'perm'}
              className="segmented-item"
            >
              Permanentes
            </button>
            <button
              type="button"
              onClick={() => { setDentition('decid'); setSelected(null); }}
              aria-pressed={dentition === 'decid'}
              className="segmented-item"
            >
              Decíduos
            </button>
          </div>
        </div>

        <Arch numbers={upper} arch="upper" />
        <div className="mx-auto w-4/5 border-t border-dashed border-border" aria-hidden="true" />
        <Arch numbers={lower} arch="lower" />

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-border pt-3">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].chip}`} aria-hidden="true" />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* Editor panel */}
      {selected != null ? (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4 animate-fade-in" aria-live="polite">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Dente {selected}
              {selectedData && (
                <span className="ml-2 font-normal text-muted-foreground">· {STATUS_META[selectedData.status].label}</span>
              )}
            </p>
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
              Fechar
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                disabled={isPending}
                onClick={() => apply(s)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
                  selectedData?.status === s
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface hover:bg-surface-alt',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                ].join(' ')}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_META[s].chip}`} aria-hidden="true" />
                {STATUS_META[s].label}
              </button>
            ))}
            {selectedData && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => apply(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-alt hover:text-destructive transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Remover marcação
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <label htmlFor="tooth-note" className="sr-only">Observação do dente {selected}</label>
            <input
              id="tooth-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Observação (ex: canal, restauração MO...)"
              className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {selectedData && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => apply(selectedData.status)}
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Salvar nota
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Escolha uma situação acima — a nota é salva junto.</p>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          {marked.length > 0
            ? `${marked.length} dente${marked.length > 1 ? 's' : ''} precisando de atenção: ${marked.map((t) => t.toothNumber).sort((a, b) => a - b).join(', ')}.`
            : 'Clique em um dente para marcar a situação.'}
        </p>
      )}

      {/* Notes summary */}
      {teeth.some((t) => t.note) && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="mb-2 text-sm font-semibold">Anotações por dente</h3>
          <ul className="space-y-1.5">
            {teeth.filter((t) => t.note).sort((a, b) => a.toothNumber - b.toothNumber).map((t) => (
              <li key={t.toothNumber} className="flex gap-2 text-sm">
                <span className="w-8 shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">{t.toothNumber}</span>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATUS_META[t.status].chip}`} aria-hidden="true" />
                <span className="min-w-0">{t.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
