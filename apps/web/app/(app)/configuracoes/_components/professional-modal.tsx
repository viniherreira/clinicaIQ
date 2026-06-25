'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { createProfessional, updateProfessional, type ProfessionalFormState } from '../actions';
import { PROFESSIONAL_PALETTE } from './constants';

export interface ProfessionalModalData {
  id: string;
  name: string;
  specialty: string | null;
  color: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  professional?: ProfessionalModalData | null;
  defaultColor: string;
}

export function ProfessionalModal({ open, onClose, onSuccess, professional, defaultColor }: Props) {
  const isEdit = !!professional;
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState(defaultColor);

  const action = isEdit
    ? updateProfessional.bind(null, professional!.id)
    : createProfessional;
  const [state, formAction, pending] = useActionState<ProfessionalFormState | null, FormData>(
    action,
    null,
  );

  // Reset local state each time the modal opens.
  useEffect(() => {
    if (open) {
      setColor(professional?.color ?? defaultColor);
      const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, professional, defaultColor]);

  // Close on success.
  useEffect(() => {
    if (state?.success) onSuccess();
  }, [state, onSuccess]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const errors = state && !state.success ? state.errors : {};
  const fieldErr = (k: string) => errors[k]?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-surface p-6 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {isEdit ? 'Editar profissional' : 'Novo profissional'}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              A cor identifica o profissional na agenda.
            </p>
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
          {state && !state.success && state.message && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="prof-name" className="text-sm font-medium">
              Nome <span className="text-destructive">*</span>
            </label>
            <input
              ref={firstFieldRef}
              id="prof-name"
              name="name"
              type="text"
              required
              defaultValue={professional?.name ?? ''}
              aria-required="true"
              aria-invalid={!!fieldErr('name')}
              aria-describedby={fieldErr('name') ? 'prof-name-err' : undefined}
              placeholder="Ex: Dra. Ana Costa"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {fieldErr('name') && (
              <p id="prof-name-err" className="text-xs text-destructive">{fieldErr('name')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="prof-specialty" className="text-sm font-medium">
              Especialidade
            </label>
            <input
              id="prof-specialty"
              name="specialty"
              type="text"
              defaultValue={professional?.specialty ?? ''}
              placeholder="Ex: Ortodontia"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Cor na agenda</legend>
            <input type="hidden" name="color" value={color} />
            <div role="radiogroup" aria-label="Cor do profissional" className="flex flex-wrap gap-2">
              {PROFESSIONAL_PALETTE.map((c) => {
                const selected = c.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Cor ${c}`}
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      selected ? 'ring-2 ring-offset-2 ring-offset-surface ring-foreground' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {selected && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mx-auto"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pending ? 'Salvando...' : isEdit ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
