'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { addPayment, deletePayment, type PaymentFormState } from '../actions';

interface PaymentRow {
  id: string;
  amount: number;
  method: string | null;
  notes: string | null;
  paidAt: Date | string;
  quoteNumber: number | null;
}
interface AcceptedQuote {
  id: string;
  number: number;
  total: number;
}
interface Props {
  patientId: string;
  contracted: number;
  paid: number;
  balance: number;
  payments: PaymentRow[];
  acceptedQuotes: AcceptedQuote[];
}

const METHODS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto', 'Outro'];

function brl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FinancialSection({ patientId, contracted, paid, balance, payments, acceptedQuotes }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<PaymentFormState | null, FormData>(
    addPayment.bind(null, patientId),
    null,
  );
  const [isDeleting, startDelete] = useTransition();

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setAmount('');
      setShowForm(false);
      router.refresh();
    }
  }, [state, router]);

  const errors = state && !state.success ? state.errors : {};

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted-foreground">Contratado (orçamentos aceitos)</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{brl(contracted)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted-foreground">Pago</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-success">{brl(paid)}</p>
        </div>
        <div className={`rounded-xl border p-4 shadow-card ${balance > 0 ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40' : 'border-border bg-surface'}`}>
          <p className={`text-xs font-medium ${balance > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>Em aberto</p>
          <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${balance > 0 ? 'text-amber-900 dark:text-amber-200' : 'text-success'}`}>
            {brl(balance)}
          </p>
        </div>
      </div>

      {/* Payments */}
      <section className="rounded-xl border border-border bg-surface shadow-card" aria-label="Pagamentos">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold">Pagamentos</h3>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Registrar pagamento
          </button>
        </div>

        {showForm && (
          <form ref={formRef} action={formAction} className="space-y-3 border-b border-border bg-surface-alt/50 p-4 animate-fade-in sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="pay-amount" className="text-xs font-medium">Valor <span className="text-destructive">*</span></label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <input
                    id="pay-amount"
                    name="amount"
                    inputMode="numeric"
                    required
                    value={amount}
                    onChange={(e) => setAmount(maskBRL(e.target.value))}
                    placeholder="0,00"
                    aria-invalid={!!errors.amount}
                    className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                </div>
                {errors.amount && <p className="text-xs text-destructive">{errors.amount[0]}</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor="pay-method" className="text-xs font-medium">Forma</label>
                <select id="pay-method" name="method" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <option value="">—</option>
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="pay-quote" className="text-xs font-medium">Orçamento</label>
                <select id="pay-quote" name="quoteId" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <option value="">Sem vínculo</option>
                  {acceptedQuotes.map((q) => (
                    <option key={q.id} value={q.id}>ORC-{String(q.number).padStart(4, '0')} · {brl(q.total)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="pay-notes" className="text-xs font-medium">Observação</label>
              <input id="pay-notes" name="notes" maxLength={300} placeholder="Ex: entrada, parcela 2/6..." className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Cancelar</button>
              <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {pending ? 'Salvando...' : 'Salvar pagamento'}
              </button>
            </div>
          </form>
        )}

        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tabular-nums">{brl(p.amount)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(p.paidAt).toLocaleDateString('pt-BR')}
                    {p.method && ` · ${p.method}`}
                    {p.quoteNumber != null && ` · ORC-${String(p.quoteNumber).padStart(4, '0')}`}
                    {p.notes && ` · ${p.notes}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => startDelete(async () => { await deletePayment(p.id, patientId); router.refresh(); })}
                  aria-label={`Excluir pagamento de ${brl(p.amount)}`}
                  className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
