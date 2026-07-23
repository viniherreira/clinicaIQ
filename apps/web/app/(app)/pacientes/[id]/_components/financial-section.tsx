'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { addPayment, deletePayment, type PaymentFormState } from '../actions';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface PaymentRow {
  id: string;
  amount: number;
  method: string | null;
  notes: string | null;
  paidAt: Date | string;
  quoteId: string | null;
  quoteNumber: number | null;
}
interface AcceptedQuote {
  id: string;
  number: number;
  total: number;
}
interface QuoteRow {
  id: string;
  number: number;
  status: string;
  total: number;
  paid: number;
  createdAt: Date | string;
}
interface Props {
  patientId: string;
  contracted: number;
  paid: number;
  balance: number;
  payments: PaymentRow[];
  acceptedQuotes: AcceptedQuote[];
  quotes: QuoteRow[];
}

const QUOTE_STATUS_PT: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Rascunho', cls: 'bg-surface-alt text-muted-foreground' },
  SENT: { label: 'Enviado', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  VIEWED: { label: 'Visualizado', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  ACCEPTED: { label: 'Aprovado', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  REJECTED: { label: 'Recusado', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  EXPIRED: { label: 'Expirado', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300' },
};

const METHODS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Boleto', 'Outro'];

function brl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FinancialSection({ patientId, contracted, paid, balance, payments, acceptedQuotes, quotes }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [quoteId, setQuoteId] = useState('');
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
      setMethod('');
      setQuoteId('');
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

      {/* Quotes for this patient */}
      <section className="rounded-xl border border-border bg-surface shadow-card" aria-label="Orçamentos do paciente">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold">Orçamentos</h3>
          <Link href={`/orcamentos/novo?patientId=${patientId}`} className="btn-outline btn-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Novo orçamento
          </Link>
        </div>
        {quotes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum orçamento para este paciente.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {quotes.map((q) => {
              const meta = QUOTE_STATUS_PT[q.status] ?? QUOTE_STATUS_PT.DRAFT;
              return (
                <li key={q.id}>
                  <Link
                    href={`/orcamentos/${q.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-xs font-medium text-primary">
                        ORC-{String(q.number).padStart(4, '0')}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {new Date(q.createdAt).toLocaleDateString('pt-BR')}
                        {q.paid > 0 && ` · pago ${brl(q.paid)}`}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">{brl(q.total)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
                <span className="text-xs font-medium" id="pay-method-label">Forma</span>
                <input type="hidden" name="method" value={method} />
                <Select value={method || undefined} onValueChange={setMethod}>
                  <SelectTrigger aria-labelledby="pay-method-label"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium" id="pay-quote-label">Orçamento</span>
                <input type="hidden" name="quoteId" value={quoteId} />
                <Select value={quoteId || '__none__'} onValueChange={(v) => setQuoteId(v === '__none__' ? '' : v)}>
                  <SelectTrigger aria-labelledby="pay-quote-label"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem vínculo</SelectItem>
                    {acceptedQuotes.map((q) => (
                      <SelectItem key={q.id} value={q.id}>ORC-{String(q.number).padStart(4, '0')} · {brl(q.total)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    {p.quoteId && p.quoteNumber != null && (
                      <>
                        {' · '}
                        <Link href={`/orcamentos/${p.quoteId}`} className="hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                          ORC-{String(p.quoteNumber).padStart(4, '0')}
                        </Link>
                      </>
                    )}
                    {p.notes && ` · ${p.notes}`}
                  </p>
                </div>
                <Link
                  href={`/financeiro/recibo/${p.id}`}
                  aria-label={`Recibo do pagamento de ${brl(p.amount)}`}
                  title="Baixar recibo"
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-alt hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </Link>
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
