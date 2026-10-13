import { cookies } from 'next/headers';
import { requireCrm } from '@/crm/guard';
import { loadBoardLeads, parseFilters, tagCounts } from '@/crm/board-data';
import { loadCrmBasics } from '@/crm/page-data';
import { classifyPending, listConversations } from '@/crm/conversations';
import { can } from '@/lib/permissions';
import { Board } from './_components/board';
import { CrmToolbar } from './_components/toolbar';
import { PipelineEditor } from './_components/pipeline-editor';

export const metadata = { title: 'Funil · ClinicaIQ' };

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm');
  const sp = await searchParams;
  const canConfig = can(ctx.role, 'crm_config');
  // O funil da URL; sem ela, o último aberto; sem nada, o principal.
  const lembrado = (await cookies()).get('crm-funil')?.value;
  const basics = await loadCrmBasics(ctx, { pipelineId: typeof sp.funil === 'string' ? sp.funil : lembrado });
  const funil = basics.current;
  const filters = { ...parseFilters(sp), funil: funil.id };
  // Etapa de outro funil no filtro não vale aqui.
  if (filters.etapa && !funil.columns.some((s) => s.id === filters.etapa)) filters.etapa = '';
  const editando = sp.editar === '1' && canConfig;

  await classifyPending(ctx.db, ctx.tenantId);
  const [leads, inbox, counts, porEtapa] = await Promise.all([
    editando ? Promise.resolve([]) : loadBoardLeads(ctx, filters),
    editando ? Promise.resolve([]) : listConversations(ctx.db, ctx, 'inbox', '', 30),
    tagCounts(ctx),
    editando
      ? ctx.db.lead.groupBy({
          by: ['stageId'],
          where: { tenantId: ctx.tenantId, stage: { pipelineId: funil.id } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  if (editando) {
    const totais = new Map(porEtapa.map((r) => [r.stageId, r._count._all]));
    return (
      <PipelineEditor
        pipeline={funil}
        allStages={basics.allStages.filter((s) => s.pipelineId === funil.id)}
        leadCounts={Object.fromEntries(totais)}
        otherPipelines={basics.pipelines.filter((p) => p.id !== funil.id).map((p) => ({ id: p.id, name: p.name }))}
        isMain={basics.pipelines[0]?.id === funil.id}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <CrmToolbar
        view="quadro"
        filters={filters}
        tags={basics.tags.map((t) => ({ ...t, count: counts.get(t.id) ?? 0 }))}
        team={basics.team}
        procedures={basics.procedures}
        meId={ctx.userId}
        summary={{ count: leads.length, valueCents: leads.reduce((s, l) => s + (l.valueCents ?? 0), 0) }}
        pipelines={basics.pipelines}
        currentPipeline={funil}
        canConfig={canConfig}
      />
      <Board
        key={funil.id}
        stages={funil.columns}
        leads={leads}
        closedStages={funil.closed}
        lostReasons={basics.lostReasons}
        canDelete={canConfig}
        // A Entrada (números novos do WhatsApp) aparece no funil principal.
        inbox={basics.pipelines[0]?.id === funil.id ? inbox : []}
      />
    </div>
  );
}
