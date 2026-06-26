import { notFound } from 'next/navigation';
import { getPublicQuote } from './actions';
import { PublicQuoteActions } from './public-quote';

export const metadata = { title: 'Seu orçamento', robots: { index: false } };

function brl(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await getPublicQuote(token);
  if (!quote) notFound();

  const validUntil = new Date(quote.validUntil).toLocaleDateString('pt-BR');
  const discountAmount = quote.subtotal - quote.total;
  const discountLabel = quote.discountType === 'PERCENT' ? `${quote.discountValue}%` : brl(quote.discountValue);
  const actionable = quote.status === 'VIEWED';

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Clinic header */}
        <header className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            {quote.clinicName.slice(0, 2).toUpperCase()}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{quote.clinicName}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Orçamento ORC-{String(quote.number).padStart(4, '0')} · para {quote.patientName}
          </p>
        </header>

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-sm font-semibold">Itens do orçamento</h2>
          </div>

          <table className="w-full text-sm">
            <caption className="sr-only">Itens do orçamento</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Item</th>
                <th scope="col" className="px-2 py-2.5 text-center font-medium">Qtd</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Valor</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((it) => (
                <tr key={it.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-medium sm:px-6">{it.name}</td>
                  <td className="px-2 py-3 text-center tabular-nums text-muted-foreground">{it.quantity}</td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums sm:px-6">{brl(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1.5 border-t border-border bg-surface-alt/50 px-5 py-4 text-sm sm:px-6">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{brl(quote.subtotal)}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Desconto ({discountLabel})</span><span className="tabular-nums">- {brl(discountAmount)}</span></div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold"><span>Total</span><span className="tabular-nums text-primary">{brl(quote.total)}</span></div>
          </div>
        </div>

        {quote.notes && (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm">
            <p className="whitespace-pre-wrap text-foreground">{quote.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">Válido até {validUntil}</p>

        {/* Action / status */}
        {actionable ? (
          <PublicQuoteActions token={token} />
        ) : quote.status === 'ACCEPTED' ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-5 text-center">
            <p className="font-semibold text-success">✓ Você aceitou este orçamento</p>
            <p className="mt-1 text-sm text-muted-foreground">A clínica já foi notificada.</p>
          </div>
        ) : quote.status === 'REJECTED' ? (
          <div className="rounded-xl border border-border bg-surface-alt p-5 text-center">
            <p className="font-semibold">Você recusou este orçamento</p>
            {quote.rejectReason && <p className="mt-1 text-sm text-muted-foreground">“{quote.rejectReason}”</p>}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-alt p-5 text-center">
            <p className="font-semibold">Este orçamento expirou</p>
            <p className="mt-1 text-sm text-muted-foreground">Entre em contato com a clínica para um novo orçamento.</p>
          </div>
        )}

        <footer className="pt-2 text-center text-xs text-muted-foreground">
          {quote.clinicName}{quote.clinicPhone ? ` · ${quote.clinicPhone}` : ''}
        </footer>
      </div>
    </main>
  );
}
