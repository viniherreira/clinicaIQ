'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { getProfessionalSchedule, updateProfessionalSchedule, type ProfessionalDay } from '../actions';

interface Props {
  open: boolean;
  professionalId: string | null;
  professionalName: string;
  onClose: () => void;
  onSaved: () => void;
}

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display

const timeCls =
  'rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40';

function emptyWeek(): ProfessionalDay[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    work: dayOfWeek >= 1 && dayOfWeek <= 5,
    start: '08:00',
    end: '18:00',
    lunchStart: '',
    lunchEnd: '',
  }));
}

export function ScheduleModal({ open, professionalId, professionalName, onClose, onSaved }: Props) {
  const titleId = useId();
  const [days, setDays] = useState<ProfessionalDay[]>(emptyWeek());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !professionalId) return;
    setError(null);
    setLoading(true);
    let alive = true;
    getProfessionalSchedule(professionalId)
      .then((rows) => {
        if (!alive) return;
        setDays(rows.length === 7 ? rows : emptyWeek());
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, professionalId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function update(dow: number, patch: Partial<ProfessionalDay>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)));
  }

  function save() {
    if (!professionalId) return;
    startTransition(async () => {
      const res = await updateProfessionalSchedule(professionalId, days);
      if (!res.ok) {
        setError(res.message ?? 'Não foi possível salvar.');
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">Horário de atendimento</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{professionalName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 -mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-xs text-muted-foreground">
            Sem horário definido, a agenda usa o horário de funcionamento da clínica. O almoço é opcional.
          </p>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="divide-y divide-border">
              {DAY_ORDER.map((dow) => {
                const d = days.find((x) => x.dayOfWeek === dow)!;
                return (
                  <div key={dow} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <label className="flex w-28 shrink-0 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={d.work}
                          onChange={(e) => update(dow, { work: e.target.checked })}
                          className="h-4 w-4 rounded accent-primary"
                          aria-label={`${DAY_LABELS[dow]} — atende`}
                        />
                        <span className="text-sm font-medium">{DAY_LABELS[dow]}</span>
                      </label>
                      {d.work ? (
                        <div className="flex items-center gap-1.5">
                          <input type="time" value={d.start} onChange={(e) => update(dow, { start: e.target.value })} aria-label={`${DAY_LABELS[dow]} — início`} className={timeCls} />
                          <span className="text-xs text-muted-foreground">às</span>
                          <input type="time" value={d.end} onChange={(e) => update(dow, { end: e.target.value })} aria-label={`${DAY_LABELS[dow]} — fim`} className={timeCls} />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Não atende</span>
                      )}
                    </div>
                    {d.work && (
                      <div className="mt-2 flex items-center gap-1.5 pl-[calc(7rem+0.75rem)] max-sm:pl-0">
                        <span className="text-xs text-muted-foreground">Almoço</span>
                        <input type="time" value={d.lunchStart} onChange={(e) => update(dow, { lunchStart: e.target.value })} aria-label={`${DAY_LABELS[dow]} — início do almoço`} className={timeCls} />
                        <span className="text-xs text-muted-foreground">às</span>
                        <input type="time" value={d.lunchEnd} onChange={(e) => update(dow, { lunchEnd: e.target.value })} aria-label={`${DAY_LABELS[dow]} — fim do almoço`} className={timeCls} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {error && <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-5">
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={isPending || loading} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {isPending ? 'Salvando…' : 'Salvar horários'}
          </button>
        </div>
      </div>
    </div>
  );
}
