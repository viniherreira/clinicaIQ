import { requireCrm } from '@/crm/guard';
import { loadCrmBasics } from '@/crm/page-data';
import { parseConditions, type StageTriggerKind } from '@/crm/stage-automation-rules';
import { DigitalPipeline, type ActionKind, type PipelineAutomation } from './_components/digital-pipeline';

export const metadata = { title: 'Funil digital · DreamClin' };

/**
 * O "funil digital" do Kommo: uma coluna por etapa do funil e, nela, os
 * gatilhos que rodam sozinhos quando o lead é criado ou movido para lá.
 * Cada funil tem os seus (`?funil=`).
 */
export default async function AutomacoesEtapasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCrm('crm_config');
  const sp = await searchParams;
  const basics = await loadCrmBasics(ctx, { pipelineId: typeof sp.funil === 'string' ? sp.funil : null });
  const funil = basics.current;
  const [automations, templates, bots] = await Promise.all([
    ctx.db.stageAutomation.findMany({
      where: { stage: { pipelineId: funil.id } },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, stageId: true, action: true, config: true, trigger: true, conditions: true, delayMinutes: true, active: true },
    }),
    ctx.db.messageTemplate.findMany({ where: { status: 'APPROVED', purpose: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, variables: true } }),
    ctx.db.chatbotFlow.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, active: true } }),
  ]);
  const nomeFunil = new Map(basics.pipelines.map((p) => [p.id, p.name]));
  // Fechou e Perdeu também têm colunas: dá para agradecer quem fechou.
  const colunas = basics.allStages.filter((s) => s.pipelineId === funil.id);

  return (
    <DigitalPipeline
      pipelines={basics.pipelines.map((p) => ({ id: p.id, name: p.name }))}
      currentId={funil.id}
      columns={colunas.map((s) => ({ id: s.id, name: s.name, color: s.color, role: s.role }))}
      automations={automations.map(
        (a): PipelineAutomation => ({
          ...a,
          action: a.action as ActionKind,
          config: (a.config ?? {}) as Record<string, unknown>,
          trigger: a.trigger as StageTriggerKind,
          conditions: parseConditions(a.conditions),
        }),
      )}
      tags={basics.tags.map((t) => ({ id: t.id, name: t.name }))}
      team={basics.team.map((u) => ({ id: u.id, name: u.name ?? 'Sem nome' }))}
      templates={templates}
      bots={bots}
      stages={basics.allStages.map((s) => ({ id: s.id, name: s.name, role: s.role, pipelineName: nomeFunil.get(s.pipelineId) ?? '' }))}
    />
  );
}
