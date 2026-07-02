'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setToothRecord } from '../actions';

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

/** FDI notation, displayed as the patient's arches (right side first). */
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const STATUS_META: Record<ToothStatus, { label: string; tooth: string; chip: string }> = {
  TO_TREAT: {
    label: 'Precisa tratar',
    tooth: 'bg-red-100 border-red-400 text-red-800 dark:bg-red-950/60 dark:border-red-500 dark:text-red-200',
    chip: 'bg-red-500',
  },
  IN_TREATMENT: {
    label: 'Em tratamento',
    tooth: 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-950/60 dark:border-amber-500 dark:text-amber-200',
    chip: 'bg-amber-500',
  },
  TREATED: {
    label: 'Tratado',
    tooth: 'bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-200',
    chip: 'bg-emerald-500',
  },
  EXTRACTED: {
    label: 'Extraído',
    tooth: 'bg-surface-alt border-border-strong text-muted-foreground line-through',
    chip: 'bg-slate-500',
  },
  MISSING: {
    label: 'Ausente',
    tooth: 'bg-transparent border-dashed border-border-strong text-muted-foreground/60',
    chip: 'bg-slate-300 dark:bg-slate-600',
  },
};

const STATUS_ORDER: ToothStatus[] = ['TO_TREAT', 'IN_TREATMENT', 'TREATED', 'EXTRACTED', 'MISSING'];

export function Odontogram({ patientId, teeth }: Props) {
  const router = useRouter();
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

  function Tooth({ n }: { n: number }) {
    const data = byNumber.get(n);
    const meta = data ? STATUS_META[data.status] : null;
    const isSel = selected === n;
    return (
      <button
        type="button"
        onClick={() => pick(n)}
        aria-pressed={isSel}
        aria-label={`Dente ${n}${meta ? ` — ${meta.label}` : ''}${data?.note ? ` — ${data.note}` : ''}`}
        title={meta ? `${n} · ${meta.label}` : `Dente ${n}`}
        className={[
          'flex h-9 w-7 shrink-0 items-center justify-center rounded-md rounded-b-xl border text-[11px] font-semibold tabular-nums transition-all sm:h-10 sm:w-8',
          meta ? meta.tooth : 'border-border bg-surface text-foreground hover:border-primary/50 hover:bg-primary/5',
          isSel ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface scale-110' : '',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        ].join(' ')}
      >
        {n}
      </button>
    );
  }

  function Arch({ label, numbers, flip }: { label: string; numbers: number[]; flip?: boolean }) {
    return (
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
        <div className="overflow-x-auto pb-1">
          <div className={`flex w-max gap-1 ${flip ? 'items-start' : 'items-end'}`} role="group" aria-label={label}>
            {numbers.slice(0, 8).map((n) => <Tooth key={n} n={n} />)}
            <span className="mx-1 h-9 w-px self-center bg-border-strong sm:h-10" aria-hidden="true" />
            {numbers.slice(8).map((n) => <Tooth key={n} n={n} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <Arch label="Arcada superior" numbers={UPPER} />
        <Arch label="Arcada inferior" numbers={LOWER} flip />

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
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
        <p className="text-sm text-muted-foreground">
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
