import { clinicToday } from '@/lib/tz';
import { getReportData, type ReportType } from './actions';
import { ReportsView } from './_components/reports-view';

export const metadata = { title: 'Relatórios · ClinicaIQ' };

const TYPES: ReportType[] = ['agendamentos', 'orcamentos', 'recebimentos'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RelatoriosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);

  const today = clinicToday();
  const monthStart = `${today.slice(0, 8)}01`;

  const type = (TYPES.includes(one('type') as ReportType) ? one('type') : 'agendamentos') as ReportType;
  const from = DATE_RE.test(one('from') ?? '') ? (one('from') as string) : monthStart;
  const to = DATE_RE.test(one('to') ?? '') ? (one('to') as string) : today;
  const professionalId = one('professionalId') ?? '';
  const procedureId = one('procedureId') ?? '';
  const status = one('status') ?? '';

  const data = await getReportData({ type, from, to, professionalId, procedureId, status });

  return (
    <ReportsView
      type={type}
      from={from}
      to={to}
      professionalId={professionalId}
      procedureId={procedureId}
      status={status}
      data={data}
    />
  );
}
