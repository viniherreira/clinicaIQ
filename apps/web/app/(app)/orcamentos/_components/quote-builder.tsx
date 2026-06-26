'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Trash2, Loader2 } from 'lucide-react';
import { createQuote, updateQuote, searchQuotePatients, type QuoteFormState } from '../actions';
import { formatBRL, maskBRLInput, brlToNumber } from './constants';

interface ProcedureOption {
  id: string;
  name: string;
  basePrice: number;
  allowsDiscount: boolean;
  maxDiscountPercent: number | null;
}
interface Patient {
  id: string;
  name: string;
  controlNumber: number;
}
export interface QuoteItemDraft {
  key: string;
  procedureId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  maxDiscount: number | null;
}
interface Props {
  mode: 'create' | 'edit';
  quoteId?: string;
  procedures: ProcedureOption[];
  defaultValidUntil: string;
  initial?: {
    patient: Patient;
    discountType: 'PERCENT' | 'FIXED';
    discountValue: number;
    validUntil: string;
    notes: string;
    internalNotes: string;
    items: QuoteItemDraft[];
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
let keySeq = 0;
const newKey = () => `it-${Date.now()}-${keySeq++}`;

export function QuoteBuilder({ mode, quoteId, procedures, defaultValidUntil, initial }: Props) {
  const router = useRouter();
  const action = mode === 'edit' && quoteId ? updateQuote.bind(null, quoteId) : createQuote;
  const [state, formAction, pending] = useActionState<QuoteFormState | null, FormData>(action, null);

  const [patient, setPatient] = useState<Patient | null>(initial?.patient ?? null);
  const [query, setQuery] = useState(initial?.patient.name ?? '');
  const [results, setResults] = useState<Patient[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, startSearch] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [items, setItems] = useState<QuoteItemDraft[]>(initial?.items ?? []);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>(initial?.discountType ?? 'PERCENT');
  const [discountValue, setDiscountValue] = useState(initial?.discountValue ?? 0);
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? defaultValidUntil);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [internalNotes, setInternalNotes] = useState(initial?.internalNotes ?? '');
  const [procToAdd, setProcToAdd] = useState('');

  useEffect(() => {
    if (state?.success) router.push(`/orcamentos/${state.quoteId}`);
  }, [state, router]);

  // Patient search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (patient || !query.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchQuotePatients(query));
        setShowResults(true);
      });
    }, 300);
  }, [query, patient]);

  const totals = useMemo(() => {
    const lines = items.map((it) => round2(it.unitPrice * it.quantity * (1 - (it.discountPercent || 0) / 100)));
    const subtotal = round2(lines.reduce((s, n) => s + n, 0));
    const discountAmount = discountType === 'PERCENT' ? round2((subtotal * (discountValue || 0)) / 100) : round2(discountValue || 0);
    const total = round2(Math.max(0, subtotal - discountAmount));
    return { subtotal, discountAmount, total };
  }, [items, discountType, discountValue]);

  function addProcedure(id: string) {
    const proc = procedures.find((p) => p.id === id);
    if (!proc) return;
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        procedureId: proc.id,
        name: proc.name,
        unitPrice: proc.basePrice,
        quantity: 1,
        discountPercent: 0,
        maxDiscount: proc.allowsDiscount ? (proc.maxDiscountPercent ?? 100) : 0,
      },
    ]);
    setProcToAdd('');
  }

  function addCustom() {
    setItems((prev) => [...prev, { key: newKey(), procedureId: null, name: '', unitPrice: 0, quantity: 1, discountPercent: 0, maxDiscount: 100 }]);
  }

  function updateItem(key: string, patch: Partial<QuoteItemDraft>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function selectPatient(p: Patient) {
    setPatient(p);
    setQuery(p.name);
    setShowResults(false);
  }

  const fieldErr = (k: string) => (state && !state.success ? state.errors?.[k]?.[0] : undefined);
  const inputCls = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  function onSubmit(formData: FormData) {
    formData.set('patientId', patient?.id ?? '');
    formData.set('discountType', discountType);
    formData.set('discountValue', String(discountValue));
    formData.set('validUntil', validUntil);
    formData.set('notes', notes);
    formData.set('internalNotes', internalNotes);
    formData.set('items', JSON.stringify(items.map(({ procedureId, name, unitPrice, quantity, discountPercent }) => ({ procedureId, name, unitPrice, quantity, discountPercent }))));
    formAction(formData);
  }

  return (
    <form action={onSubmit} className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {state && !state.success && state.message && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p>
        )}

        {/* Patient */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Paciente</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPatient(null); }}
              onFocus={() => results.length > 0 && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder="Buscar paciente por nome..."
              aria-label="Buscar paciente"
              role="combobox"
              aria-expanded={showResults}
              aria-controls="quote-patient-list"
              className={`${inputCls} pl-9`}
            />
            {showResults && results.length > 0 && (
              <ul id="quote-patient-list" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
                {results.map((p) => (
                  <li key={p.id} role="option" aria-selected={patient?.id === p.id}>
                    <button type="button" onMouseDown={() => selectPatient(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-alt">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">Nº {p.controlNumber}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {patient && <p className="mt-2 text-xs text-muted-foreground">Selecionado: <span className="font-medium text-foreground">{patient.name}</span> · Nº {patient.controlNumber}</p>}
          {fieldErr('patientId') && <p className="mt-1 text-xs text-destructive">{fieldErr('patientId')}</p>}
        </section>

        {/* Items */}
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Procedimentos</h2>
            <div className="flex items-center gap-2">
              <select value={procToAdd} onChange={(e) => e.target.value && addProcedure(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Adicionar procedimento">
                <option value="">+ Adicionar procedimento</option>
                {procedures.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.basePrice)}</option>)}
              </select>
              <button type="button" onClick={addCustom} className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Item
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Adicione procedimentos ao orçamento.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.key} className="rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) => updateItem(it.key, { name: e.target.value })}
                      placeholder="Nome do item"
                      aria-label="Nome do item"
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    <button type="button" onClick={() => removeItem(it.key)} aria-label={`Remover ${it.name || 'item'}`} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Valor unit.
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <input inputMode="numeric" value={it.unitPrice ? maskBRLInput(String(Math.round(it.unitPrice * 100))) : ''} onChange={(e) => updateItem(it.key, { unitPrice: brlToNumber(e.target.value) })} className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="0,00" aria-label="Valor unitário" />
                      </div>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Qtd.
                      <input type="number" min={1} max={999} value={it.quantity} onChange={(e) => updateItem(it.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Quantidade" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Desc. {it.maxDiscount != null && it.maxDiscount < 100 ? `(máx ${it.maxDiscount}%)` : '%'}
                      <input type="number" min={0} max={it.maxDiscount ?? 100} value={it.discountPercent || ''} onChange={(e) => updateItem(it.key, { discountPercent: Math.min(it.maxDiscount ?? 100, Math.max(0, Number(e.target.value) || 0)) })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Desconto do item em %" />
                    </label>
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Subtotal
                      <span className="flex h-9 items-center justify-end px-1 text-sm font-medium tabular-nums text-foreground">
                        {formatBRL(round2(it.unitPrice * it.quantity * (1 - (it.discountPercent || 0) / 100)))}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {fieldErr('items') && <p className="mt-2 text-xs text-destructive">{fieldErr('items')}</p>}
        </section>

        {/* Notes */}
        <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="q-notes" className="text-sm font-medium">Observações <span className="text-xs font-normal text-muted-foreground">(o paciente vê)</span></label>
            <textarea id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className="w-full rounded-md border border-border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="Condições, formas de pagamento..." />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="q-internal" className="text-sm font-medium">Nota interna <span className="text-xs font-normal text-muted-foreground">(só a equipe vê)</span></label>
            <textarea id="q-internal" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} maxLength={2000} className="w-full rounded-md border border-border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          </div>
        </section>
      </div>

      {/* Summary sidebar */}
      <aside className="lg:col-span-1">
        <div className="sticky top-6 space-y-4 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Resumo</h2>

          <div className="space-y-1.5">
            <label htmlFor="q-valid" className="text-xs font-medium text-muted-foreground">Válido até</label>
            <input id="q-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Desconto geral</span>
            <div className="flex gap-2">
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'PERCENT' | 'FIXED')} className="h-10 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Tipo de desconto">
                <option value="PERCENT">%</option>
                <option value="FIXED">R$</option>
              </select>
              {discountType === 'PERCENT' ? (
                <input type="number" min={0} max={100} value={discountValue || ''} onChange={(e) => setDiscountValue(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className={inputCls} placeholder="0" aria-label="Valor do desconto em porcentagem" />
              ) : (
                <input inputMode="numeric" value={discountValue ? maskBRLInput(String(Math.round(discountValue * 100))) : ''} onChange={(e) => setDiscountValue(brlToNumber(e.target.value))} className={inputCls} placeholder="0,00" aria-label="Valor do desconto em reais" />
              )}
            </div>
          </div>

          <dl className="space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatBRL(totals.subtotal)}</dd></div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-destructive"><dt>Desconto</dt><dd className="tabular-nums">- {formatBRL(totals.discountAmount)}</dd></div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums text-primary">{formatBRL(totals.total)}</dd></div>
          </dl>

          <button type="submit" disabled={pending} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {pending ? 'Salvando...' : mode === 'edit' ? 'Salvar alterações' : 'Criar orçamento'}
          </button>
          <button type="button" onClick={() => router.push('/orcamentos')} className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Cancelar
          </button>
        </div>
      </aside>
    </form>
  );
}
