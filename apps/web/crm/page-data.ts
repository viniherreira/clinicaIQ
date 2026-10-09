import 'server-only';

import type { CrmContext } from './guard';
import { boardStages, ensureDefaultPipeline, stageByRole } from './pipeline';
import type { BoardPerson, BoardStage, BoardTag, LostReasonOption } from './types';

/**
 * O que toda tela do CRM precisa ao redor dos leads: etapas, tags, motivos de
 * perda, a equipe e os procedimentos. Garante o funil padrão na primeira vez.
 */
export async function loadCrmBasics(ctx: CrmContext) {
  await ensureDefaultPipeline(ctx.db, ctx.tenantId);

  const [stages, tags, reasons, team, procedures] = await Promise.all([
    ctx.db.pipelineStage.findMany({ orderBy: { order: 'asc' } }),
    ctx.db.leadTag.findMany({ orderBy: { name: 'asc' } }),
    ctx.db.lostReason.findMany({ where: { active: true }, orderBy: { order: 'asc' } }),
    ctx.db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ctx.db.procedure.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const toStage = (s: (typeof stages)[number]): BoardStage => ({ id: s.id, name: s.name, color: s.color, role: s.role });
  const won = stageByRole(stages, 'WON');
  const lost = stageByRole(stages, 'LOST');
  if (!won || !lost) throw new Error('Funil sem as etapas de ganho e perda.');

  return {
    allStages: stages.map(toStage),
    columns: boardStages(stages).map(toStage),
    closedStages: { won: won.id, lost: lost.id },
    tags: tags.map((t): BoardTag => ({ id: t.id, name: t.name, color: t.color })),
    lostReasons: reasons.map((r): LostReasonOption => ({ id: r.id, name: r.name })),
    team: team as BoardPerson[],
    procedures,
  };
}
