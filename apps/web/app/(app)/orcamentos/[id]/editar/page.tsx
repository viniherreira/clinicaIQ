import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { format } from 'date-fns';
import { ChevronLeft } from 'lucide-react';
import { getQuote, listQuoteProcedures, defaultValidUntil } from '../../actions';
import { QuoteBuilder } from '../../_components/quote-builder';

export const metadata = { title: 'Editar orçamento · ClinicaIQ' };

export default async function EditarOrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, procedures, fallbackValid] = await Promise.all([
    getQuote(id),
    listQuoteProcedures(),
    defaultValidUntil(),
  ]);

  if (!quote) notFound();
  if (quote.status !== 'DRAFT') redirect(`/orcamentos/${id}`);

  const initial = {
    patient: quote.patient,
    discountType: quote.discountType as 'PERCENT' | 'FIXED',
    discountValue: quote.discountValue,
    validUntil: format(new Date(quote.validUntil), 'yyyy-MM-dd'),
    notes: quote.notes ?? '',
    internalNotes: quote.internalNotes ?? '',
    items: quote.items.map((it) => {
      const proc = procedures.find((p) => p.id === it.procedureId);
      return {
        key: it.id,
        procedureId: it.procedureId,
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        discountPercent: it.discountPercent,
        maxDiscount: proc ? (proc.allowsDiscount ? (proc.maxDiscountPercent ?? 100) : 0) : 100,
      };
    }),
  };

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <header className="mb-6">
        <Link href={`/orcamentos/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar orçamento</h1>
      </header>
      <QuoteBuilder mode="edit" quoteId={id} procedures={procedures} defaultValidUntil={fallbackValid} initial={initial} />
    </div>
  );
}
