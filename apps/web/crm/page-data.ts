import 'server-only';

import type { CrmContext } from './guard';
import { crmMemberIds } from './assignment';
import { listFieldDefs } from './lead-fields';
import { boardStages, ensureDefaultPipeline, mainPipeline, stageByRole } from './pipeline';
import type { BoardPerson, BoardPipeline, BoardStage, BoardTag, LostReasonOption } from './types';

export { pipelineOfStage, stageOptions } from './pipeline-options';

/**
 * O que toda tela do CRM precisa ao redor dos leads: funis e etapas, tags,
 * motivos de perda, a equipe e os procedimentos. Garante o funil padrão na
 * primeira vez.
 *
 * `pipelineId` escolhe o funil "atual" (o do quadro); sem ele, ou se não for
 * desta clínica, é o principal.
 */
export async function loadCrmBasics(ctx: CrmContext, opts: { pipelineId?: string | null } = {}) {
  await ensureDefaultPipeline(ctx.db, ctx.tenantId);

  const [pipelines, stages, tags, reasons, team, procedures, fields, membros] = await Promise.all([
    ctx.db.pipeline.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
    ctx.db.pipelineStage.findMany({ orderBy: { order: 'asc' } }),
    ctx.db.leadTag.findMany({ orderBy: { name: 'asc' } }),
    ctx.db.lostReason.findMany({ where: { active: true }, orderBy: { order: 'asc' } }),
    ctx.db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ctx.db.procedure.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    listFieldDefs(ctx.db, { activeOnly: true }),
    crmMemberIds(ctx.tenantId),
  ]);

  const toStage = (s: (typeof stages)[number]): BoardStage => ({
    id: s.id,
    name: s.name,
    color: s.color,
    role: s.role,
    pipelineId: s.pipelineId,
  });

  const funis: BoardPipeline[] = pipelines.flatMap((p) => {
    const daqui = stages.filter((s) => s.pipelineId === p.id);
    const won = stageByRole(daqui, 'WON');
    const lost = stageByRole(daqui, 'LOST');
    // Funil sem ganho ou perda não dá para usar; não deveria existir.
    if (!won || !lost) return [];
    return [{ id: p.id, name: p.name, columns: boardStages(daqui).map(toStage), closed: { won: won.id, lost: lost.id } }];
  });
  const principal = mainPipeline(pipelines);
  const current =
    funis.find((p) => p.id === opts.pipelineId) ?? funis.find((p) => p.id === principal?.id) ?? funis[0];
  if (!current) throw new Error('Funil sem as etapas de ganho e perda.');

  return {
    pipelines: funis,
    current,
    allStages: stages.map(toStage),
    columns: current.columns,
    closedStages: current.closed,
    tags: tags.map((t): BoardTag => ({ id: t.id, name: t.name, color: t.color })),
    lostReasons: reasons.map((r): LostReasonOption => ({ id: r.id, name: r.name })),
    // Quem usa o CRM: é para essas pessoas que dá para passar um negócio.
    team: team.filter((p) => membros.has(p.id)) as BoardPerson[],
    procedures,
    /** Campos personalizados ativos, na ordem (ficha, card, filtros, Novo lead). */
    fields,
  };
}
