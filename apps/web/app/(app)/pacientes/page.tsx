import Link from 'next/link';
import { Suspense } from 'react';
import { listPatients } from './actions';
import { PatientTable } from './_components/patient-table';
import { PatientAvatar } from './_components/patient-avatar';
import { PatientStatusBadge } from './_components/patient-status-badge';

export const metadata = { title: 'Pacientes' };

async function PatientsContent({
  search,
  page,
}: {
  search: string;
  page: number;
}) {
  const { patients, total, pages, recent } = await listPatients({ search, page });

  return (
    <div className="space-y-6">
      {/* Recently added */}
      {recent.length > 0 && !search && (
        <section aria-label="Adicionados recentemente">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Adicionados recentemente
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recent.map((p) => (
              <Link
                key={p.id}
                href={`/pacientes/${p.id}`}
                className="flex shrink-0 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <PatientAvatar name={p.name} size="sm" />
                <div className="min-w-0">
                  <p className="max-w-[120px] truncate text-xs font-medium">{p.name}</p>
                  <PatientStatusBadge active={p.active} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Table */}
      <PatientTable
        patients={patients}
        total={total}
        pages={pages}
        currentPage={page}
        search={search}
      />
    </div>
  );
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.q ?? '';
  const page = Math.max(1, Number(params.page ?? 1));

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lista de pacientes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Gerencie os pacientes da clínica</p>
        </div>
        <Link
          href="/pacientes/novo"
          className="touch-target inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" /><path d="M12 5v14" />
          </svg>
          Adicionar paciente
        </Link>
      </header>

      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>}>
        <PatientsContent search={search} page={page} />
      </Suspense>
    </div>
  );
}
