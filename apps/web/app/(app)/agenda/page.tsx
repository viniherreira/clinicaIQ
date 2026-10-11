import { Suspense } from 'react';
import { getAgendaData, getPrefillPatient } from './actions';
import { AgendaShell } from './_components/agenda-shell';
import { clinicToday } from '@/lib/tz';

interface PageProps {
  searchParams: Promise<{ date?: string; view?: string; novo?: string; paciente?: string }>;
}

export default async function AgendaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const dateStr = params.date ?? clinicToday();
  const view = (params.view === 'week' ? 'week' : 'day') as 'day' | 'week';

  const [data, prefillPatient] = await Promise.all([
    getAgendaData(dateStr, view),
    params.novo === '1' && params.paciente ? getPrefillPatient(params.paciente) : Promise.resolve(null),
  ]);

  return (
    <Suspense>
      <AgendaShell
        initialDate={dateStr}
        initialView={view}
        initialData={data}
        prefillPatient={prefillPatient}
      />
    </Suspense>
  );
}
