'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createProcedure, updateProcedure } from '../actions';
import type { ProcedureFormState } from '../actions';
import { PROCEDURE_COLORS, DURATION_SHORTCUTS } from './constants';

export interface ProcedureModalData {
  id: string;
  name: string;
  categoryId: string | null;
  description: string | null;
  basePrice: number;
  durationMinutes: number;
  prepTimeMinutes: number | null;
  color: string | null;
  internalCode: string | null;
  materials: string | null;
  allowsDiscount: boolean;
  maxDiscountPercent: number | null;
  professionalIds: string[];
  linkedCount: number; // agendamentos + itens de orçamento vinculados
}

interface Category {
  id: string;
  name: string;
  color: string | null;
}
interface Professional {
  id: string;
  name: string;
  specialty: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  professionals: Professional[];
  /** undefined enquanto carrega os dados de edição; null para criação. */
  procedure?: ProcedureModalData | null;
  loading?: boolean;
}

// ─── Máscara monetária (centavos) ──────────────────────────────────────────────
function maskBRL(value: string): string {
  const cents = value.replace(/\D/g, '');
  if (!cents) return '';
  const n = Number(cents) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({
  id, label, required, error, hint, children,
}: {
  id: string; label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50';

export function ProcedureModal({
  open, onClose, onSuccess, categories, professionals, procedure, loading,
}: Props) {
  const isEdit = Boolean(procedure?.id);
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [color, setColor] = useState<string>('');
  const [allowsDiscount, setAllowsDiscount] = useState(false);
  const [selectedPros, setSelectedPros] = useState<string[]>([]);

  // Sincroniza o estado quando o procedimento (edição) carrega ou o modal abre.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setShowOptional(false);
    setPrice(procedure ? maskBRL(String(Math.round(procedure.basePrice * 100))) : '');
    setDuration(procedure ? String(procedure.durationMinutes) : '');
    setColor(procedure?.color ?? '');
    setAllowsDiscount(procedure?.allowsDiscount ?? false);
    setSelectedPros(procedure?.professionalIds ?? []);
  }, [open, procedure]);

  // Esc para fechar.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const err = (f: string) => errors[f]?.[0];

  function togglePro(id: string) {
    setSelectedPros((cur) => (cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setServerError(null);
    const formData = new FormData(e.currentTarget);
    // multi-select de profissionais
    formData.delete('professionalIds');
    selectedPros.forEach((id) => formData.append('professionalIds', id));

    startTransition(async () => {
      try {
        let result: ProcedureFormState;
        if (isEdit && procedure?.id) {
          result = await updateProcedure(procedure.id, null, formData);
        } else {
          result = await createProcedure(null, formData);
        }
        if (result.success) {
          onSuccess();
        } else {
          setErrors(result.errors);
          if (result.message) setServerError(result.message);
          dialogRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch {
        setServerError('Ocorreu um erro inesperado. Tente novamente.');
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proc-modal-title"
        className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <h2 id="proc-modal-title" className="text-base font-semibold">
            {isEdit ? 'Editar procedimento' : 'Novo procedimento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-16 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4 px-5 py-4">
            {serverError && (
              <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{serverError}</div>
            )}

            {isEdit && procedure && procedure.linkedCount > 0 && (
              <div role="status" className="flex items-start gap-2 rounded-md bg-warning/10 px-4 py-3 text-sm text-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-warning"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                <span>Este procedimento está vinculado a <strong>{procedure.linkedCount}</strong> agendamento(s) e/ou orçamento(s). Alterações de valor e duração não afetam registros já criados.</span>
              </div>
            )}

            {/* Obrigatórios */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="name" label="Nome" required error={err('name')}>
                  <input id="name" name="name" type="text" required autoFocus defaultValue={procedure?.name ?? ''} className={inputCls} placeholder="Ex.: Limpeza de pele" aria-describedby={err('name') ? 'name-error' : undefined} aria-invalid={err('name') ? true : undefined} />
                </Field>
              </div>

              <Field id="categoryId" label="Categoria" required error={err('categoryId')}>
                <select id="categoryId" name="categoryId" required defaultValue={procedure?.categoryId ?? ''} className={inputCls}>
                  <option value="">Selecione</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              <Field id="basePrice" label="Valor" required error={err('basePrice')}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <input
                    id="basePrice" name="basePrice" type="text" inputMode="numeric" required
                    value={price}
                    onChange={(e) => setPrice(maskBRL(e.target.value))}
                    className={`${inputCls} pl-9`} placeholder="0,00"
                    aria-describedby={err('basePrice') ? 'basePrice-error' : undefined}
                    aria-invalid={err('basePrice') ? true : undefined}
                  />
                </div>
              </Field>

              <div className="sm:col-span-2">
                <Field id="durationMinutes" label="Duração (minutos)" required error={err('durationMinutes')}>
                  <div className="flex items-center gap-2">
                    <input
                      id="durationMinutes" name="durationMinutes" type="number" min={1} step={5} required
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className={`${inputCls} w-28`} placeholder="30"
                      aria-describedby={err('durationMinutes') ? 'durationMinutes-error' : undefined}
                      aria-invalid={err('durationMinutes') ? true : undefined}
                    />
                    <div className="flex flex-wrap gap-1" role="group" aria-label="Durações rápidas">
                      {DURATION_SHORTCUTS.map((m) => (
                        <button
                          key={m} type="button" onClick={() => setDuration(String(m))}
                          aria-pressed={duration === String(m)}
                          className="rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-surface-alt aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </Field>
              </div>
            </div>

            {/* Opcionais */}
            <div className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setShowOptional((v) => !v)}
                aria-expanded={showOptional}
                className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Informações adicionais
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showOptional ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {showOptional && (
                <div className="space-y-4 border-t border-border p-4">
                  <Field id="description" label="Descrição">
                    <textarea id="description" name="description" rows={2} defaultValue={procedure?.description ?? ''} className={`${inputCls} resize-none`} placeholder="Descrição do procedimento" />
                  </Field>

                  {/* Color picker */}
                  <fieldset>
                    <legend className="mb-2 block text-sm font-medium">Cor</legend>
                    <input type="hidden" name="color" value={color} />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button" onClick={() => setColor('')} aria-pressed={color === ''}
                        aria-label="Sem cor"
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${color === '' ? 'border-foreground ring-2 ring-offset-1 ring-foreground' : 'border-border'}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                      </button>
                      {PROCEDURE_COLORS.map((c) => (
                        <button
                          key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c}
                          aria-label={`Cor ${c}`}
                          className={`h-7 w-7 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${color === c ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="internalCode" label="Código interno">
                      <input id="internalCode" name="internalCode" type="text" defaultValue={procedure?.internalCode ?? ''} className={inputCls} placeholder="Ex.: PROC-001" />
                    </Field>
                    <Field id="prepTimeMinutes" label="Tempo de preparo (min)">
                      <input id="prepTimeMinutes" name="prepTimeMinutes" type="number" min={0} step={5} defaultValue={procedure?.prepTimeMinutes ?? ''} className={inputCls} placeholder="0" />
                    </Field>
                  </div>

                  {/* Profissionais habilitados */}
                  <fieldset>
                    <legend className="mb-2 block text-sm font-medium">Profissionais habilitados</legend>
                    {professionals.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum profissional cadastrado.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {professionals.map((pro) => (
                          <label key={pro.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-alt">
                            <input
                              type="checkbox" checked={selectedPros.includes(pro.id)} onChange={() => togglePro(pro.id)}
                              className="h-4 w-4 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            />
                            <span className="truncate">{pro.name}{pro.specialty ? ` · ${pro.specialty}` : ''}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>

                  <Field id="materials" label="Materiais necessários">
                    <textarea id="materials" name="materials" rows={2} defaultValue={procedure?.materials ?? ''} className={`${inputCls} resize-none`} placeholder="Liste os materiais utilizados" />
                  </Field>

                  {/* Desconto */}
                  <div className="rounded-md border border-border p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox" name="allowsDiscount" value="1" checked={allowsDiscount}
                        onChange={(e) => setAllowsDiscount(e.target.checked)}
                        className="h-4 w-4 rounded border-border text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                      Permite desconto
                    </label>
                    {allowsDiscount && (
                      <div className="mt-3">
                        <Field id="maxDiscountPercent" label="Desconto máximo (%)" error={err('maxDiscountPercent')}>
                          <input id="maxDiscountPercent" name="maxDiscountPercent" type="number" min={0} max={100} step={1} defaultValue={procedure?.maxDiscountPercent ?? ''} className={`${inputCls} w-28`} placeholder="10" />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Cancelar
              </button>
              <button type="submit" disabled={isPending} className="touch-target inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">
                {isPending && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar procedimento'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
