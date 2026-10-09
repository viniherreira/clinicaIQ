import { requireCrm } from '@/crm/guard';
import { loadBoardLeads, parseFilters } from '@/crm/board-data';
import { loadCrmBasics } from '@/crm/page-data';
import { can } from '@/lib/permissions';
import { Board } from './_components/board';
import { CrmToolbar } from './_components/toolbar';

export const metadata = { title: 'Funil · ClinicaIQ' };

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm');
  const filters = parseFilters(await searchParams);
  const [basics, leads] = await Promise.all([loadCrmBasics(ctx), loadBoardLeads(ctx, filters)]);

  return (
    <div className="flex h-full flex-col gap-4">
      <CrmToolbar
        view="quadro"
        filters={filters}
        tags={basics.tags}
        team={basics.team}
        procedures={basics.procedures}
        meId={ctx.userId}
      />
      <Board
        stages={basics.columns}
        leads={leads}
        closedStages={basics.closedStages}
        lostReasons={basics.lostReasons}
        canDelete={can(ctx.role, 'crm_config')}
      />
    </div>
  );
}
