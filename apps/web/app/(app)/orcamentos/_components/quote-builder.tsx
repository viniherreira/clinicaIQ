'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Trash2, Loader2, Copy, ClipboardList } from 'lucide-react';
import { createQuote, updateQuote, searchQuotePatients, type QuoteFormState } from '../actions';
import { formatBRL, maskBRLInput, brlToNumber } from './constants';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { describePayment, MAX_INSTALLMENTS, PAYMENT_METHODS } from '@/lib/payment-terms';
import { paymentSchedule } from '@/lib/payment-schedule';
import { parseTeeth, teethLabel } from '@/lib/teeth';
import { ProcedurePicker, type ProcedureOption } from './procedure-picker';
import { ToothPicker } from './tooth-picker';

/** O Select do Radix não aceita valor vazio; isto faz o papel de "nenhum". */
const NENHUM = 'none';

interface Patient {
  id: string;
  name: string;
  controlNumber: number;
}
export interface QuoteItemDraft {
  key: string;
  procedureId: string | null;
  name: string;
  /** Dente, região ou detalhe. */
  description: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  maxDiscount: number | null;
}
interface ProfessionalOption {
  id: string;
  name: string;
  registration: string | null;
}
interface Props {
  mode: 'create' | 'edit';
  quoteId?: string;
  procedures: ProcedureOption[];
  professionals: ProfessionalOption[];
  defaultValidUntil: string;
  /** Hoje na clínica (AAAA-MM-DD), para a prévia das parcelas. */
  today?: string;
  initial?: {
    patient: Patient;
    professionalId: string | null;
    discountType: 'PERCENT' | 'FIXED';
    discountValue: number;
    validUntil: string;
    paymentMethod: string | null;
    downPayment: number;
    installments: number;
    notes: string;
    internalNotes: string;
    items: QuoteItemDraft[];
  };
  /** Pre-selected patient when arriving from the agenda or a patient record. */
  initialPatient?: Patient;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
let keySeq = 0;
const newKey = () => `it-${Date.now()}-${keySeq++}`;

export function QuoteBuilder({
  mode,
  quoteId,
  procedures,
  professionals,
  defaultValidUntil,
  today,
  initial,
  initialPatient,
}: Props) {
  const router = useRouter();
  const action = mode === 'edit' && quoteId ? updateQuote.bind(null, quoteId) : createQuote;
  const [state, formAction, pending] = useActionState<QuoteFormState | null, FormData>(action, null);

  const preselected = initial?.patient ?? initialPatient ?? null;
  const [patient, setPatient] = useState<Patient | null>(preselected);
  const [query, setQuery] = useState(preselected?.name ?? '');
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
  // Com um profissional só, ele é o responsável — perguntar seria burocracia.
  const [professionalId, setProfessionalId] = useState<string>(
    initial ? (initial.professionalId ?? NENHUM) : professionals.length === 1 ? professionals[0].id : NENHUM,
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(initial?.paymentMethod ?? NENHUM);
  const [downPayment, setDownPayment] = useState(initial?.downPayment ?? 0);
  const [installments, setInstallments] = useState(initial?.installments ?? 1);

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

  function addProcedure(proc: ProcedureOption) {
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        procedureId: proc.id,
        name: proc.name,
        description: '',
        unitPrice: proc.basePrice,
        quantity: 1,
        discountPercent: 0,
        maxDiscount: proc.allowsDiscount ? (proc.maxDiscountPercent ?? 100) : 0,
      },
    ]);
  }

  /** O mesmo procedimento em outro dente: copia tudo menos dente e região. */
  function duplicateItem(key: string) {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.key === key);
      if (i < 0) return prev;
      const copia = { ...prev[i], key: newKey(), description: '', quantity: 1 };
      return [...prev.slice(0, i + 1), copia, ...prev.slice(i + 1)];
    });
  }

  /** Dentes escolhidos no odontograma viram o texto do item e a quantidade (um por dente). */
  function setTeeth(key: string, teeth: number[]) {
    updateItem(key, { description: teethLabel(teeth), quantity: Math.max(1, teeth.length) });
  }

  function addCustom() {
    setItems((prev) => [...prev, { key: newKey(), procedureId: null, name: '', description: '', unitPrice: 0, quantity: 1, discountPercent: 0, maxDiscount: 100 }]);
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

  // A entrada nunca passa do total na prévia — o servidor recusa se passar, mas
  // a frase de pagamento não deve mostrar um absurdo enquanto se digita.
  const effectiveDown = Math.min(downPayment, totals.total);
  const paymentPreview = describePayment({
    total: totals.total,
    downPayment: effectiveDown,
    installments,
    method: paymentMethod === NENHUM ? null : paymentMethod,
  });
  const downTooBig = downPayment > totals.total + 0.004 && totals.total > 0;
  // Como ficariam as parcelas se o orçamento fosse aprovado hoje.
  const plano = paymentSchedule(
    { total: totals.total, downPayment: effectiveDown, installments, method: paymentMethod === NENHUM ? null : paymentMethod },
    today ?? new Date().toISOString().slice(0, 10),
  );

  const fieldErr = (k: string) => (state && !state.success ? state.errors?.[k]?.[0] : undefined);
  const inputCls = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  function onSubmit(formData: FormData) {
    formData.set('patientId', patient?.id ?? '');
    formData.set('discountType', discountType);
    formData.set('discountValue', String(discountValue));
    formData.set('validUntil', validUntil);
    formData.set('notes', notes);
    formData.set('internalNotes', internalNotes);
    formData.set('professionalId', professionalId === NENHUM ? '' : professionalId);
    formData.set('paymentMethod', paymentMethod === NENHUM ? '' : paymentMethod);
    formData.set('downPayment', String(effectiveDown));
    formData.set('installments', String(installments));
    formData.set('items', JSON.stringify(items.map(({ procedureId, name, description, unitPrice, quantity, discountPercent }) => ({ procedureId, name, description, unitPrice, quantity, discountPercent }))));
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
        <section aria-labelledby="q-itens" className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 id="q-itens" className="text-sm font-semibold">Procedimentos</h2>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? 'item' : 'itens'} · {formatBRL(totals.subtotal)}
              </span>
            )}
          </div>
          <ProcedurePicker procedures={procedures} onPick={addProcedure} onCustom={addCustom} />

          {items.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-1 rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              <ClipboardList className="h-6 w-6" aria-hidden="true" />
              Busque um procedimento acima para começar. Enter adiciona.
            </div>
          ) : (
            <ol className="mt-3 divide-y divide-border rounded-lg border border-border">
              {items.map((it, i) => {
                const linha = round2(it.unitPrice * it.quantity * (1 - (it.discountPercent || 0) / 100));
                const dentes = parseTeeth(it.description);
                return (
                  <li key={it.key} className="p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={it.name}
                            onChange={(e) => updateItem(it.key, { name: e.target.value })}
                            placeholder="Nome do item"
                            aria-label="Nome do item"
                            maxLength={160}
                            className="h-9 min-w-[180px] flex-1 rounded-md border border-border bg-background px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          />
                          <input
                            type="text"
                            value={it.description}
                            onChange={(e) => updateItem(it.key, { description: e.target.value })}
                            placeholder="Dente / região"
                            aria-label={`Dente ou região de ${it.name || 'item'}`}
                            maxLength={160}
                            className="h-9 w-40 rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-48"
                          />
                          <ToothPicker value={dentes} onChange={(t) => setTeeth(it.key, t)} itemName={it.name} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_100px_1fr]">
                          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                            Valor unitário
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
                            Desconto {it.maxDiscount === 0 ? '(não aceita)' : it.maxDiscount != null && it.maxDiscount < 100 ? `(até ${it.maxDiscount}%)` : '%'}
                            <input
                              type="number"
                              min={0}
                              max={it.maxDiscount ?? 100}
                              value={it.discountPercent || ''}
                              disabled={it.maxDiscount === 0}
                              title={it.maxDiscount === 0 ? 'Este procedimento não aceita desconto (ver Procedimentos).' : undefined}
                              onChange={(e) => updateItem(it.key, { discountPercent: Math.min(it.maxDiscount ?? 100, Math.max(0, Number(e.target.value) || 0)) })}
                              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm tabular-nums disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              aria-label="Desconto do item em %"
                              placeholder="0"
                            />
                          </label>
                          <div className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-1">
                            <span className="sm:text-right">Total do item</span>
                            <span className="flex h-9 items-center justify-end text-base font-semibold tabular-nums text-foreground">{formatBRL(linha)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button type="button" onClick={() => duplicateItem(it.key)} aria-label={`Duplicar ${it.name || 'item'}`} title="Duplicar (outro dente)" className="rounded-md p-2 text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => removeItem(it.key)} aria-label={`Remover ${it.name || 'item'}`} title="Remover" className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {fieldErr('items') && <p className="mt-2 text-xs text-destructive">{fieldErr('items')}</p>}
        </section>

        {/* Notes */}
        <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="q-notes" className="text-sm font-medium">Observações <span className="text-xs font-normal text-muted-foreground">(o paciente vê)</span></label>
            <textarea id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className="w-full rounded-md border border-border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" placeholder="Ex.: tratamento em 4 sessões; a coroa é feita depois do canal." />
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

          {professionals.length > 0 && (
            <div className="space-y-1.5">
              <span id="q-prof-label" className="text-xs font-medium text-muted-foreground">
                Profissional responsável
              </span>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger aria-labelledby="q-prof-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Não definir</SelectItem>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.registration ? ` · ${p.registration}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <span id="q-desc-label" className="text-xs font-medium text-muted-foreground">Desconto geral</span>
            <div className="flex gap-2">
              <div role="group" aria-labelledby="q-desc-label" className="segmented shrink-0">
                {(['PERCENT', 'FIXED'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={discountType === t}
                    onClick={() => {
                      setDiscountType(t);
                      setDiscountValue(0);
                    }}
                    className="segmented-item px-3"
                  >
                    {t === 'PERCENT' ? '%' : 'R$'}
                    <span className="sr-only">{t === 'PERCENT' ? ' em porcentagem' : ' em reais'}</span>
                  </button>
                ))}
              </div>
              {discountType === 'PERCENT' ? (
                <input type="number" min={0} max={100} value={discountValue || ''} onChange={(e) => setDiscountValue(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className={`${inputCls} min-w-0`} placeholder="0" aria-label="Valor do desconto em porcentagem" />
              ) : (
                <input inputMode="numeric" value={discountValue ? maskBRLInput(String(Math.round(discountValue * 100))) : ''} onChange={(e) => setDiscountValue(brlToNumber(e.target.value))} className={`${inputCls} min-w-0`} placeholder="0,00" aria-label="Valor do desconto em reais" />
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

          <fieldset className="space-y-3 border-t border-border pt-4">
            <legend className="mb-1 text-sm font-semibold">Pagamento</legend>

            <div className="space-y-1.5">
              <span id="q-method-label" className="text-xs font-medium text-muted-foreground">Forma</span>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger aria-labelledby="q-method-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>A combinar</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label htmlFor="q-down" className="text-xs font-medium text-muted-foreground">Entrada</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                  <input
                    id="q-down"
                    inputMode="numeric"
                    value={downPayment ? maskBRLInput(String(Math.round(downPayment * 100))) : ''}
                    onChange={(e) => setDownPayment(brlToNumber(e.target.value))}
                    placeholder="0,00"
                    aria-invalid={downTooBig || !!fieldErr('downPayment')}
                    aria-describedby="q-payment-preview"
                    className={`${inputCls} pl-8 tabular-nums`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="q-inst" className="text-xs font-medium text-muted-foreground">
                  {effectiveDown > 0 ? 'Parcelas do saldo' : 'Parcelas'}
                </label>
                <input
                  id="q-inst"
                  type="number"
                  min={1}
                  max={MAX_INSTALLMENTS}
                  value={installments}
                  onChange={(e) =>
                    setInstallments(Math.min(MAX_INSTALLMENTS, Math.max(1, Math.floor(Number(e.target.value) || 1))))
                  }
                  aria-describedby="q-payment-preview"
                  className={`${inputCls} tabular-nums`}
                />
              </div>
            </div>

            <p
              id="q-payment-preview"
              aria-live="polite"
              className={`rounded-md px-3 py-2 text-xs leading-relaxed ${
                downTooBig ? 'bg-destructive/10 text-destructive' : 'bg-surface-alt text-muted-foreground'
              }`}
            >
              {downTooBig ? 'A entrada é maior que o total do orçamento.' : paymentPreview}
            </p>
            {!downTooBig && plano.length > 1 && (
              <ol aria-label="Parcelas, contando da aprovação" className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {plano.map((p) => (
                  <li key={p.key} className="flex justify-between gap-2 tabular-nums">
                    <span className="text-muted-foreground">
                      {p.label} · {p.dueDate.split('-').reverse().join('/')}
                    </span>
                    <span className="font-medium">{formatBRL(p.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </fieldset>

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
