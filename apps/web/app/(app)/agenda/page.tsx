import { Suspense } from 'react';
import { getAgendaData } from './actions';
import { AgendaShell } from './_components/agenda-shell';
import { clinicToday } from '@/lib/tz';

interface PageProps {
  searchParams: Promise<{ date?: string; view?: string }>;
}

export default async function AgendaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const dateStr = params.date ?? clinicToday();
  const view = (params.view === 'week' ? 'week' : 'day') as 'day' | 'week';

  const data = await getAgendaData(dateStr, view);

  return (
    <Suspense>
      <AgendaShell
        initialDate={dateStr}
        initialView={view}
        initialData={data}
      />
    </Suspense>
  );
}
