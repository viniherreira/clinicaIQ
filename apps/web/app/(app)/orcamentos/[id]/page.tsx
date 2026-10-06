import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { getContractGaps, getQuote } from '../actions';
import { QuoteDetailActions } from '../_components/quote-detail-actions';
import { QuotePayments } from '../_components/quote-payments';
import { QUOTE_STATUS, formatBRL, quoteCode } from '../_components/constants';
import { requireCapability } from '@/lib/guard';
import { describePayment } from '@/lib/payment-terms';
import { wallDateBR } from '@/lib/tz';

export const metadata = { title: 'Orçamento · ClinicaIQ' };

export default async function OrcamentoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Mesma régua da listagem: orçamento é dinheiro, e esta página leva ao PDF e
  // ao contrato, que trazem CPF e valores.
  await requireCapability('financeiro');

  const { id } = await params;
  const [quote, gaps] = await Promise.all([getQuote(id), getContractGaps(id)]);
  if (!quote) notFound();

  const meta = QUOTE_STATUS[quote.status] ?? QUOTE_STATUS.DRAFT;
  const discountLabel =
    quote.discountType === 'PERCENT' ? `${quote.discountValue}%` : formatBRL(quote.discountValue);
  const discountAmount = Number(quote.subtotal) - Number(quote.total);
  const payment = describePayment({
    total: quote.total,
    downPayment: quote.downPayment,
    installments: quote.installments,
    method: quote.paymentMethod,
  });

  const timeline = [
    quote.sentAt && { label: 'Enviado', at: quote.sentAt },
    quote.viewedAt && { label: 'Visualizado pelo paciente', at: quote.viewedAt },
    quote.acceptedAt && { label: 'Aceito', at: quote.acceptedAt },
    quote.rejectedAt && { label: 'Recusado', at: quote.rejectedAt },
  ].filter(Boolean) as { label: string; at: Date }[];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <div>
        <Link href="/orcamentos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Orçamentos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{quoteCode(quote.number)}</h1>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.bg} ${meta.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
            {meta.label}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href={`/pacientes/${quote.patient.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
            {quote.patient.name}
          </Link>{' '}
          · Nº {quote.patient.controlNumber} · criado em {format(new Date(quote.createdAt), 'dd/MM/yyyy')}
          {quote.professional && (
            <>
              {' '}
              · responsável: {quote.professional.name}
              {quote.professional.registration ? ` (${quote.professional.registration})` : ''}
            </>
          )}
        </p>
      </div>

      <QuoteDetailActions quoteId={quote.id} status={quote.status} />

      {gaps.length > 0 && quote.status !== 'REJECTED' && quote.status !== 'EXPIRED' && (
        <aside
          aria-labelledby="gaps-title"
          className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p id="gaps-title" className="font-medium">
              Para o contrato sair completo, falta preencher:
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {gaps.map((g) => (
                <li key={g.label}>
                  <Link href={g.href} className="underline underline-offset-2 hover:no-underline">
                    {g.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs opacity-80">
              Dá para gerar mesmo assim — o que faltar sai como linha em branco para completar à caneta.
            </p>
          </div>
        </aside>
      )}

      {/* Items */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">Itens do orçamento</caption>
          <thead>
            <tr className="border-b border-border bg-surface-alt text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Item</th>
              <th scope="col" className="px-4 py-3 font-medium text-center">Qtd</th>
              <th scope="col" className="px-4 py-3 font-medium text-right">Unit.</th>
              <th scope="col" className="px-4 py-3 font-medium text-center hidden sm:table-cell">Desc.</th>
              <th scope="col" className="px-4 py-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it) => (
              <tr key={it.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium">{it.name}</span>
                  {it.description && <span className="block text-xs text-muted-foreground">{it.description}</span>}
                </td>
                <td className="px-4 py-3 text-center tabular-nums">{it.quantity}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatBRL(it.unitPrice)}</td>
                <td className="px-4 py-3 text-center tabular-nums hidden sm:table-cell">{it.discountPercent > 0 ? `${it.discountPercent}%` : '—'}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{formatBRL(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1.5 border-t border-border px-4 py-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatBRL(Number(quote.subtotal))}</span></div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-destructive"><span>Desconto ({discountLabel})</span><span className="tabular-nums">- {formatBRL(discountAmount)}</span></div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums text-primary">{formatBRL(Number(quote.total))}</span></div>
        </div>
      </section>

      <QuotePayments quoteId={quote.id} total={Number(quote.total)} payments={quote.payments} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Condições de pagamento</p>
          <p className="mt-1 font-medium">{payment}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Validade</p>
          <p className="mt-1 font-medium tabular-nums">{wallDateBR(quote.validUntil)}</p>
        </div>
        {timeline.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Histórico</p>
            <ul className="space-y-1.5 text-sm">
              {timeline.map((t, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{t.label}</span>
                  <span className="text-muted-foreground tabular-nums">{format(new Date(t.at), "dd/MM/yy HH:mm")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {quote.rejectReason && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Motivo da recusa</p>
          <p className="mt-1 text-foreground">{quote.rejectReason}</p>
        </div>
      )}

      {quote.notes && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Observações (visíveis ao paciente)</p>
          <p className="mt-1 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}
      {quote.internalNotes && (
        <div className="rounded-xl border border-border bg-surface-alt p-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Nota interna</p>
          <p className="mt-1 whitespace-pre-wrap">{quote.internalNotes}</p>
        </div>
      )}
    </div>
  );
}
