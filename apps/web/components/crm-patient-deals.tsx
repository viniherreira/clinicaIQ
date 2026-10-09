import Link from 'next/link';
import { KanbanSquare } from 'lucide-react';
import { getTenantClient } from '@clinicaiq/db';
import { currentAccess } from '@/lib/guard';
import { getTenantModules } from '@/lib/access';
import { can } from '@/lib/permissions';

/**
 * Os negócios do CRM ligados a este paciente, na ficha dele.
 *
 * Se resolve sozinho: sem o módulo CRM ou sem acesso a ele, não aparece. E
 * nunca derruba a ficha — qualquer erro aqui some em silêncio, porque a ficha
 * do paciente vale mais do que este atalho.
 */
export async function CrmPatientDeals({ patientId }: { patientId: string }) {
  try {
    const acesso = await currentAccess();
    if (!acesso || !can(acesso.role, 'crm')) return null;
    if (!(await getTenantModules(acesso.tenantId)).crm) return null;

    const leads = await getTenantClient(acesso.tenantId).lead.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, name: true, wonAt: true, lostAt: true, stage: { select: { name: true } } },
    });
    if (leads.length === 0) return null;

    return (
      <section aria-labelledby="crm-negocios" className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 id="crm-negocios" className="flex items-center gap-1.5 text-sm font-semibold">
          <KanbanSquare className="h-4 w-4 text-primary" aria-hidden="true" /> Negócios no CRM
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {leads.map((l) => (
            <li key={l.id}>
              <Link
                href={`/crm/leads/${l.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="font-medium">{l.title || l.name}</span>
                <span className="text-xs text-muted-foreground">{l.wonAt ? 'Fechou' : l.lostAt ? 'Perdeu' : l.stage.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  } catch (error) {
    console.error('[crm] negócios na ficha do paciente falharam', error instanceof Error ? error.message : error);
    return null;
  }
}
