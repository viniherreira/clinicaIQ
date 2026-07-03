'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { addQuotePayment, deleteQuotePayment, type QuotePaymentState } from '../actions';
import { formatBRL, maskBRLInput } from './constants';

interface PaymentRow {
  id: string;
  amount: number;
  method: string | null;
  notes: string | null;
  paidAt: Date | string;
}

interface Props {
  quoteId: string;
  total: number;
  payments: PaymentRow[];
}

const METHODS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto', 'Outro'];

export function QuotePayments({ quoteId, total, payments }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<QuotePaymentState | null, FormData>(
    addQuotePayment.bind(null, quoteId),
    null,
  );
  const [isDeleting, startDelete] = useTransition();

  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const fullyPaid = total > 0 && paid >= total;

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setAmount('');
      setShowForm(false);
      router.refresh();
    }
  }, [state, router]);

  function openForm() {
    // Pre-fill with the remaining amount — the most common entry.
    setAmount(remaining > 0 ? maskBRLInput(String(Math.round(remaining * 100))) : '');
    setShowForm(true);
  }

  const errors = state && !state.success ? state.errors : {};

  return (
    <section aria-label="Pagamentos do orçamento" className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Pagamentos</h2>
          {fullyPaid ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Pago
            </span>
          ) : paid > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> Parcial
            </span>
          ) : null}
        </div>
        {!fullyPaid && (
          <button type="button" onClick={openForm} className="btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Registrar pagamento
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="space-y-2 px-4 py-4 sm:px-5">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Pago ${pct}% do orçamento`}
          className="h-2.5 overflow-hidden rounded-full bg-surface-alt"
        >
          <div
            className={`h-full rounded-full transition-all ${fullyPaid ? 'bg-emerald-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            Pago: <span className="font-semibold tabular-nums text-success">{formatBRL(paid)}</span>
            <span className="ml-1 text-xs">({pct}%)</span>
          </span>
          {!fullyPaid && (
            <span className="text-muted-foreground">
              Restante: <span className="font-semibold tabular-nums text-foreground">{formatBRL(remaining)}</span>
            </span>
          )}
          <span className="text-muted-foreground">
            Total: <span className="font-semibold tabular-nums text-foreground">{formatBRL(total)}</span>
          </span>
        </div>
      </div>

      {showForm && (
        <form ref={formRef} action={formAction} className="space-y-3 border-t border-border bg-surface-alt/50 p-4 animate-fade-in sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="qpay-amount" className="text-xs font-medium">Valor <span className="text-destructive">*</span></label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <input
                  id="qpay-amount"
                  name="amount"
                  inputMode="numeric"
                  required
                  value={amount}
                  onChange={(e) => setAmount(maskBRLInput(e.target.value))}
                  placeholder="0,00"
                  aria-invalid={!!errors.amount}
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
              </div>
              {errors.amount && <p className="text-xs text-destructive">{errors.amount[0]}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="qpay-method" className="text-xs font-medium">Forma</label>
              <select id="qpay-method" name="method" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <option value="">—</option>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="qpay-notes" className="text-xs font-medium">Observação</label>
              <input id="qpay-notes" name="notes" maxLength={300} placeholder="Ex: entrada, parcela 2/6..." className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-outline btn-sm !h-9">Cancelar</button>
            <button type="submit" disabled={pending} className="btn-primary btn-sm !h-9">
              {pending ? 'Salvando...' : 'Salvar pagamento'}
            </button>
          </div>
        </form>
      )}

      {payments.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tabular-nums">{formatBRL(p.amount)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(p.paidAt).toLocaleDateString('pt-BR')}
                  {p.method && ` · ${p.method}`}
                  {p.notes && ` · ${p.notes}`}
                </p>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => startDelete(async () => { await deleteQuotePayment(p.id, quoteId); router.refresh(); })}
                aria-label={`Excluir pagamento de ${formatBRL(p.amount)}`}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
