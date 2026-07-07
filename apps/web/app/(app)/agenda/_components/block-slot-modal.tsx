'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { createBlockedSlot, type BlockFormState } from '../actions';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface ProfessionalOption {
  id: string;
  name: string;
  color: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  professionals: ProfessionalOption[];
  defaultDate: string;
  defaultProfessionalId?: string;
  defaultTime?: string;
}

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const end = Math.min(23 * 60 + 59, h * 60 + m + 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

const inputCls =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function BlockSlotModal({
  open, onClose, onSuccess, professionals, defaultDate, defaultProfessionalId, defaultTime,
}: Props) {
  const titleId = useId();
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId ?? professionals[0]?.id ?? '');
  const [start, setStart] = useState(defaultTime ?? '12:00');
  const [end, setEnd] = useState(addHour(defaultTime ?? '12:00'));

  const [state, formAction, pending] = useActionState<BlockFormState | null, FormData>(
    createBlockedSlot,
    null,
  );

  useEffect(() => {
    if (open) {
      setProfessionalId(defaultProfessionalId ?? professionals[0]?.id ?? '');
      setStart(defaultTime ?? '12:00');
      setEnd(addHour(defaultTime ?? '12:00'));
    }
  }, [open, defaultProfessionalId, defaultTime, professionals]);

  useEffect(() => {
    if (state?.success) onSuccess();
  }, [state, onSuccess]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-surface p-6 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
              <Lock className="h-4 w-4" />
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">Bloquear horário</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Almoço, férias, feriado…</p>
            </div>
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

        <form action={formAction} className="space-y-4">
          {state && !state.success && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
            </p>
          )}

          <div className="space-y-1.5">
            <span id={`${titleId}-prof`} className="text-sm font-medium">Profissional</span>
            <input type="hidden" name="professionalId" value={professionalId} />
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger aria-labelledby={`${titleId}-prof`} className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {professionals.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="block-date" className="text-sm font-medium">Data</label>
            <input id="block-date" name="date" type="date" defaultValue={defaultDate} required className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="block-start" className="text-sm font-medium">Início</label>
              <input id="block-start" name="startTime" type="time" value={start} onChange={(e) => setStart(e.target.value)} required className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="block-end" className="text-sm font-medium">Fim</label>
              <input id="block-end" name="endTime" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required className={inputCls} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="block-reason" className="text-sm font-medium">Motivo <span className="font-normal text-muted-foreground">(opcional)</span></label>
            <input id="block-reason" name="reason" type="text" maxLength={120} placeholder="Ex: Almoço, Férias, Feriado" className={inputCls} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Cancelar
            </button>
            <button type="submit" disabled={pending || !professionalId} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {pending ? 'Bloqueando…' : 'Bloquear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
