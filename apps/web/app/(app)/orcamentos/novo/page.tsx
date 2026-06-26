import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { listQuoteProcedures, defaultValidUntil } from '../actions';
import { QuoteBuilder } from '../_components/quote-builder';

export const metadata = { title: 'Novo orçamento · ClinicaIQ' };

export default async function NovoOrcamentoPage() {
  const [procedures, validUntil] = await Promise.all([listQuoteProcedures(), defaultValidUntil()]);

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <header className="mb-6">
        <Link href="/orcamentos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Orçamentos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Novo orçamento</h1>
      </header>
      <QuoteBuilder mode="create" procedures={procedures} defaultValidUntil={validUntil} />
    </div>
  );
}
