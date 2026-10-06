import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getQuote, listQuoteProcedures, listQuoteProfessionals, defaultValidUntil } from '../../actions';
import { QuoteBuilder } from '../../_components/quote-builder';

export const metadata = { title: 'Editar orçamento · ClinicaIQ' };

export default async function EditarOrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, procedures, professionals, fallbackValid] = await Promise.all([
    getQuote(id),
    listQuoteProcedures(),
    listQuoteProfessionals(),
    defaultValidUntil(),
  ]);

  if (!quote) notFound();
  if (quote.status !== 'DRAFT') redirect(`/orcamentos/${id}`);

  // Um profissional desativado depois de criado o orçamento continua sendo o
  // responsável dele — some da lista de ativos, mas não do orçamento.
  const comResponsavel =
    quote.professional && !professionals.some((p) => p.id === quote.professional!.id)
      ? [...professionals, quote.professional]
      : professionals;

  const initial = {
    patient: quote.patient,
    professionalId: quote.professionalId,
    discountType: quote.discountType as 'PERCENT' | 'FIXED',
    discountValue: quote.discountValue,
    // Data de parede: os componentes UTC são o dia escolhido.
    validUntil: new Date(quote.validUntil).toISOString().slice(0, 10),
    paymentMethod: quote.paymentMethod,
    downPayment: quote.downPayment,
    installments: quote.installments,
    notes: quote.notes ?? '',
    internalNotes: quote.internalNotes ?? '',
    items: quote.items.map((it) => {
      const proc = procedures.find((p) => p.id === it.procedureId);
      return {
        key: it.id,
        procedureId: it.procedureId,
        name: it.name,
        description: it.description ?? '',
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
      <QuoteBuilder
        mode="edit"
        quoteId={id}
        procedures={procedures}
        professionals={comResponsavel}
        defaultValidUntil={fallbackValid}
        initial={initial}
      />
    </div>
  );
}
