import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { listQuoteProcedures, defaultValidUntil, getQuotePatient } from '../actions';
import { QuoteBuilder } from '../_components/quote-builder';

export const metadata = { title: 'Novo orçamento · ClinicaIQ' };

export default async function NovoOrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const sp = await searchParams;
  const [procedures, validUntil, patient] = await Promise.all([
    listQuoteProcedures(),
    defaultValidUntil(),
    sp.patientId ? getQuotePatient(sp.patientId) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <header className="mb-6">
        <Link href="/orcamentos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Orçamentos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Novo orçamento</h1>
        {patient && (
          <p className="mt-1 text-sm text-muted-foreground">
            Para{' '}
            <Link href={`/pacientes/${patient.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
              {patient.name}
            </Link>
          </p>
        )}
      </header>
      <QuoteBuilder
        mode="create"
        procedures={procedures}
        defaultValidUntil={validUntil}
        initialPatient={patient ?? undefined}
      />
    </div>
  );
}
