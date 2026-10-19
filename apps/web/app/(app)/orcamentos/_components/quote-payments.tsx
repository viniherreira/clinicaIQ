'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, Check, FileDown, Plus, Trash2 } from 'lucide-react';
import { deleteQuotePayment } from '../actions';
import { formatBRL } from './constants';
import { PaymentDialog } from './payment-dialog';
import { DEFAULT_RECEIPT_METHODS } from '@/lib/payment-methods';
import { allocatePayments, nextOpen, paymentSchedule, type ScheduleStatus } from '@/lib/payment-schedule';
import type { PaymentTermsInput } from '@/lib/payment-terms';

interface PaymentRow {
  id: string;
  amount: number;
  method: string | null;
  notes: string | null;
  paidAt: Date | string;
}

interface Props {
  quoteId: string;
  /** "ORC-0012 · Ana Souza" */
  quoteLabel: string;
  total: number;
  payments: PaymentRow[];
  methods?: string[];
  terms: Omit<PaymentTermsInput, 'total'>;
  /** Dia em que o plano começa (aprovação, ou criação enquanto não aprovado). AAAA-MM-DD. */
  startDay: string;
  /** Hoje na clínica, AAAA-MM-DD. */
  today: string;
}

const dia = (d: string) => d.split('-').reverse().join('/');

const SITUACAO: Record<ScheduleStatus, { label: string; cls: string }> = {
  paid: { label: 'Paga', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  partial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  open: { label: 'Em aberto', cls: 'bg-surface-alt text-muted-foreground' },
  overdue: { label: 'Atrasada', cls: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
};

/**
 * Os pagamentos do orçamento: quanto entrou e quanto falta, o plano de
 * parcelas com a situação de cada uma (o dinheiro recebido cobre as parcelas
 * em ordem) e cada recebimento, com o recibo.
 */
export function QuotePayments({ quoteId, quoteLabel, total, payments, methods = DEFAULT_RECEIPT_METHODS, terms, startDay, today }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [preselect, setPreselect] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const paid = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const fullyPaid = total > 0 && remaining <= 0;
  const lines = allocatePayments(paymentSchedule({ ...terms, total }, startDay), paid, today);
  const proxima = nextOpen(lines);
  const atrasado = lines.filter((l) => l.status === 'overdue').reduce((t, l) => t + l.due, 0);

  const receber = (key: string | null) => {
    setPreselect(key);
    setAberto(true);
  };

  return (
    <section aria-labelledby="pag-titulo" className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <h2 id="pag-titulo" className="text-sm font-semibold">
            Pagamentos
          </h2>
          {fullyPaid ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <Check className="h-3 w-3" aria-hidden="true" /> Quitado
            </span>
          ) : atrasado > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {formatBRL(atrasado)} em atraso
            </span>
          ) : paid > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Pagando
            </span>
          ) : null}
        </div>
        {!fullyPaid && total > 0 && (
          <button type="button" onClick={() => receber(null)} className="btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Registrar pagamento
          </button>
        )}
      </div>

      {/* Números do orçamento */}
      <dl className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
        {[
          { k: 'Total', v: formatBRL(total), cls: '' },
          { k: 'Recebido', v: formatBRL(paid), cls: 'text-emerald-700 dark:text-emerald-400' },
          { k: 'Falta receber', v: formatBRL(remaining), cls: remaining > 0 ? 'text-foreground' : 'text-muted-foreground' },
          {
            k: 'Próximo vencimento',
            v: proxima ? `${dia(proxima.dueDate)} · ${formatBRL(proxima.due)}` : '—',
            cls: proxima?.status === 'overdue' ? 'text-destructive' : '',
          },
        ].map((c) => (
          <div key={c.k} className="bg-surface px-4 py-3 sm:px-5">
            <dt className="text-xs text-muted-foreground">{c.k}</dt>
            <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${c.cls}`}>{c.v}</dd>
          </div>
        ))}
      </dl>
      <div className="px-4 pt-3 sm:px-5">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Pago ${pct}% do orçamento`}
          className="h-2 overflow-hidden rounded-full bg-surface-alt"
        >
          <div className={`h-full rounded-full transition-all ${fullyPaid ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-right text-xs text-muted-foreground">{pct}% pago</p>
      </div>

      {/* Plano de pagamento */}
      {lines.length > 0 && (
        <div className="px-4 pb-2 sm:px-5">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Plano de pagamento
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">Parcelas do orçamento e a situação de cada uma</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">Parcela</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Vencimento</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Situação</th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                      {l.label}
                    </th>
                    <td className={`py-2.5 pr-3 tabular-nums ${l.status === 'overdue' ? 'text-destructive' : ''}`}>{dia(l.dueDate)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatBRL(l.amount)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SITUACAO[l.status].cls}`}>
                        {SITUACAO[l.status].label}
                        {l.status === 'partial' && ` · falta ${formatBRL(l.due)}`}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {l.status !== 'paid' && (
                        <button type="button" onClick={() => receber(l.key)} className="btn-outline btn-sm">
                          Receber<span className="sr-only"> {l.label}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recebimentos */}
      <div className="border-t border-border">
        <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-5">Recebimentos</h3>
        {payments.length === 0 ? (
          <p className="px-4 pb-4 pt-1 text-sm text-muted-foreground sm:px-5">Nenhum pagamento registrado ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" aria-hidden="true">
                  <Check className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tabular-nums">{formatBRL(p.amount)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(p.paidAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    {p.method && ` · ${p.method}`}
                    {p.notes && ` · ${p.notes}`}
                  </p>
                </div>
                {apagando === p.id ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Excluir este pagamento?</span>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() =>
                        startDelete(async () => {
                          await deleteQuotePayment(p.id, quoteId);
                          setApagando(null);
                          router.refresh();
                        })
                      }
                      className="rounded-md bg-destructive px-2 py-1 font-medium text-destructive-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Excluir
                    </button>
                    <button type="button" onClick={() => setApagando(null)} className="rounded-md px-2 py-1 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring">
                      Não
                    </button>
                  </span>
                ) : (
                  <>
                    <a
                      href={`/financeiro/recibo/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <FileDown className="h-3.5 w-3.5" aria-hidden="true" /> Recibo<span className="sr-only"> de {formatBRL(p.amount)}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => setApagando(p.id)}
                      aria-label={`Excluir pagamento de ${formatBRL(p.amount)}`}
                      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PaymentDialog
        open={aberto}
        onOpenChange={setAberto}
        quoteId={quoteId}
        quoteLabel={quoteLabel}
        lines={lines}
        remaining={remaining}
        methods={methods}
        today={today}
        preselect={preselect}
        onSaved={() => router.refresh()}
      />
    </section>
  );
}
