import { requireCrm } from '@/crm/guard';
import { loadCrmBasics } from '@/crm/page-data';
import { loadPerformance } from '@/crm/performance';
import { asReportPeriod } from '@/crm/report-period';
import { PerformanceView } from './_components/performance-view';

export const metadata = { title: 'Painel' };

/**
 * O Painel de desempenho do CRM: quantos leads chegaram, quantos agendaram e
 * fecharam, quando eles chegam, de onde vêm, onde se perdem e como a equipe
 * está.
 */
export default async function PainelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCrm('crm');
  const sp = await searchParams;
  const period = asReportPeriod(typeof sp.periodo === 'string' ? sp.periodo : undefined);
  const basics = await loadCrmBasics(ctx);
  // As colunas de todos os funis (com o nome do funil, se houver mais de um).
  const varios = basics.pipelines.length > 1;
  const etapas = basics.pipelines.flatMap((p) => p.columns.map((s) => ({ ...s, name: varios ? `${p.name} · ${s.name}` : s.name })));
  const d = await loadPerformance(ctx, period, etapas, basics.team);
  return <PerformanceView data={d} period={period} ownOnly={ctx.ownOnly} />;
}
