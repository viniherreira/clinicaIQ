'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, FileDown, X } from 'lucide-react';
import { addQuotePayment, type QuotePaymentState } from '../actions';
import { formatBRL, maskBRLInput, brlToNumber } from './constants';
import { paymentNote, type ScheduleLine } from '@/lib/payment-schedule';

const dia = (d: string) => d.split('-').reverse().join('/');
const centavos = (n: number) => maskBRLInput(String(Math.round(n * 100)));

/**
 * Registrar um pagamento do orçamento, em uma tela: o que está sendo pago
 * (a próxima parcela já vem escolhida), o valor, a forma num toque, o dia e uma
 * observação. Depois de salvar, o recibo fica a um clique.
 */
export function PaymentDialog({
  open,
  onOpenChange,
  quoteId,
  quoteLabel,
  lines,
  remaining,
  methods,
  today,
  preselect,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quoteId: string;
  /** "ORC-0012 · Ana Souza" */
  quoteLabel: string;
  lines: ScheduleLine[];
  remaining: number;
  methods: string[];
  today: string;
  /** A parcela escolhida ao clicar em "Receber" numa linha do plano. */
  preselect: string | null;
  onSaved: () => void;
}) {
  const id = useId();
  const abertas = lines.filter((l) => l.status !== 'paid');
  const [alvo, setAlvo] = useState<string>('outro');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [notes, setNotes] = useState('');
  const [state, formAction, pending] = useActionState<QuotePaymentState | null, FormData>(addQuotePayment.bind(null, quoteId), null);
  const [salvo, setSalvo] = useState<{ id: string; valor: number } | null>(null);

  // Abriu: começa pela parcela pedida (ou a próxima em aberto), com o valor que falta dela.
  useEffect(() => {
    if (!open) return;
    const linha = abertas.find((l) => l.key === preselect) ?? abertas[0];
    escolher(linha ? linha.key : 'outro');
    setMethod('');
    setPaidOn(today);
    setSalvo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselect]);

  useEffect(() => {
    if (state?.success) {
      setSalvo({ id: state.paymentId, valor: brlToNumber(amount) });
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function escolher(key: string) {
    setAlvo(key);
    const linha = abertas.find((l) => l.key === key);
    if (linha) {
      setAmount(centavos(linha.due));
      setNotes(paymentNote(linha));
    } else {
      setAmount(remaining > 0 ? centavos(remaining) : '');
      setNotes('');
    }
  }

  const errors = state && !state.success ? state.errors : {};
  const valor = brlToNumber(amount);
  const passou = valor > remaining + 0.004;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold">{salvo ? 'Pagamento registrado' : 'Registrar pagamento'}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">{quoteLabel}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </Dialog.Close>
          </div>

          {salvo ? (
            <div className="space-y-4 px-5 py-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden="true" />
              <p role="status" className="text-sm">
                <span className="text-lg font-semibold tabular-nums">{formatBRL(salvo.valor)}</span>
                <span className="block text-muted-foreground">recebidos e lançados no financeiro.</span>
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <a href={`/financeiro/recibo/${salvo.id}`} target="_blank" rel="noopener noreferrer" className="btn-primary btn-md">
                  <FileDown className="h-4 w-4" aria-hidden="true" /> Baixar recibo
                </a>
                <Dialog.Close className="btn-outline btn-md">Fechar</Dialog.Close>
              </div>
            </div>
          ) : (
            <form
              action={(fd) => {
                fd.set('amount', amount);
                fd.set('method', method);
                fd.set('paidOn', paidOn);
                fd.set('notes', notes);
                formAction(fd);
              }}
              className="space-y-5 px-5 py-5"
            >
              {abertas.length > 0 && (
                <fieldset>
                  <legend className="text-xs font-medium text-muted-foreground">O que está sendo pago</legend>
                  <div className="mt-1.5 space-y-1.5">
                    {[...abertas.slice(0, 6), null].map((l) => {
                      const key = l?.key ?? 'outro';
                      const on = alvo === key;
                      return (
                        <label
                          key={key}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${on ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-alt'}`}
                        >
                          <input type="radio" name={`${id}-alvo`} checked={on} onChange={() => escolher(key)} className="h-4 w-4 accent-primary" />
                          {l ? (
                            <>
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{l.label}</span>
                                <span className={`block text-xs ${l.status === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {l.status === 'overdue' ? 'Atrasada · venceu' : 'Vence'} {dia(l.dueDate)}
                                  {l.paid > 0 && ` · já pago ${formatBRL(l.paid)}`}
                                </span>
                              </span>
                              <span className="font-semibold tabular-nums">{formatBRL(l.due)}</span>
                            </>
                          ) : (
                            <span className="flex-1 font-medium">Outro valor</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${id}-valor`} className="text-xs font-medium text-muted-foreground">
                    Valor recebido
                  </label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <input
                      id={`${id}-valor`}
                      inputMode="numeric"
                      required
                      value={amount}
                      onChange={(e) => {
                        setAmount(maskBRLInput(e.target.value));
                        setAlvo('outro');
                      }}
                      aria-invalid={passou || !!errors.amount}
                      aria-describedby={`${id}-valor-ajuda`}
                      className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-base font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                  </div>
                  <p id={`${id}-valor-ajuda`} className={`mt-1 text-xs ${passou || errors.amount ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {errors.amount?.[0] ?? (passou ? `Passa do que falta (${formatBRL(remaining)}).` : `Falta receber ${formatBRL(remaining)}.`)}
                  </p>
                </div>
                <div>
                  <label htmlFor={`${id}-dia`} className="text-xs font-medium text-muted-foreground">
                    Dia do pagamento
                  </label>
                  <input
                    id={`${id}-dia`}
                    type="date"
                    max={today}
                    value={paidOn}
                    onChange={(e) => setPaidOn(e.target.value)}
                    aria-invalid={!!errors.paidOn}
                    className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  {errors.paidOn && <p className="mt-1 text-xs text-destructive">{errors.paidOn[0]}</p>}
                </div>
              </div>

              <fieldset>
                <legend className="text-xs font-medium text-muted-foreground">Forma de pagamento</legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {methods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={method === m}
                      onClick={() => setMethod(method === m ? '' : m)}
                      className={`h-9 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${method === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-surface-alt'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor={`${id}-obs`} className="text-xs font-medium text-muted-foreground">
                  Observação <span className="font-normal">(sai no recibo)</span>
                </label>
                <input
                  id={`${id}-obs`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={300}
                  placeholder="Ex.: entrada, parcela 2 de 6"
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Dialog.Close type="button" className="btn-outline btn-md">
                  Cancelar
                </Dialog.Close>
                <button type="submit" disabled={pending || valor <= 0 || passou} className="btn-primary btn-md">
                  {pending ? 'Salvando…' : `Registrar ${valor > 0 ? formatBRL(valor) : 'pagamento'}`}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
