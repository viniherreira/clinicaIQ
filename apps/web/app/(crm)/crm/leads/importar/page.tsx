import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCrm } from '@/crm/guard';
import { loadCrmBasics } from '@/crm/page-data';
import { ImportWizard } from './_components/import-wizard';

export const metadata = { title: 'Importar leads · DreamClin' };

/**
 * Importar leads de planilha: a exportação do Kommo (Excel ou CSV) ou uma
 * planilha da clínica. O arquivo é lido no navegador; só os leads vão para o
 * servidor, em lotes.
 */
export default async function ImportarPage() {
  const ctx = await requireCrm('crm_config');
  const basics = await loadCrmBasics(ctx);
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/crm/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Leads
      </Link>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">Importar leads</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Traga os leads do Kommo ou de outra planilha. No Kommo: <strong>Leads › ⋯ › Exportar</strong>, em Excel ou CSV. Funis, etapas,
        tags, responsáveis, notas e campos vêm junto.
      </p>
      <ImportWizard
        pipelines={basics.pipelines.map((p) => ({ id: p.id, name: p.name }))}
        fields={basics.fields.map((f) => ({ id: f.id, name: f.name }))}
      />
    </div>
  );
}
