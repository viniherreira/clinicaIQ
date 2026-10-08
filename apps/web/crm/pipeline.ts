import type { StageRole, TenantPrismaClient } from '@clinicaiq/db';
import { DEFAULT_LOST_REASONS, DEFAULT_STAGES } from './defaults';

/** O mínimo de uma etapa que as regras precisam. */
export interface StageLike {
  id: string;
  name: string;
  order: number;
  role: StageRole | null;
}

const CLOSED: readonly StageRole[] = ['WON', 'LOST'];

export const isClosedStage = (stage: Pick<StageLike, 'role'>) =>
  stage.role !== null && CLOSED.includes(stage.role);

/** As colunas do quadro: tudo menos Fechou e Perdeu, na ordem da clínica. */
export function boardStages<T extends StageLike>(stages: readonly T[]): T[] {
  return stages.filter((s) => !isClosedStage(s)).sort((a, b) => a.order - b.order);
}

export function stageByRole<T extends StageLike>(stages: readonly T[], role: StageRole): T | undefined {
  return stages.find((s) => s.role === role);
}

/**
 * Posição de uma etapa no caminho do funil, para decidir se um movimento é
 * "para frente". Fechou fica depois de todas as colunas; Perdeu não está no
 * caminho (ninguém "avança" para perdido).
 */
export function progressIndex(stages: readonly StageLike[], stageId: string): number {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) return -1;
  if (stage.role === 'WON') return Number.MAX_SAFE_INTEGER;
  if (stage.role === 'LOST') return -1;
  return boardStages(stages).findIndex((s) => s.id === stageId);
}

/**
 * Para onde volta o card quando a avaliação é cancelada ou o paciente falta.
 *
 * É a coluna imediatamente antes de "Avaliação agendada" — no funil padrão,
 * "Em conversa". Achar pela posição, e não pelo nome, deixa a clínica renomear
 * ou trocar a etapa sem quebrar a regra. Se não houver nenhuma antes, cai em
 * Novo.
 */
export function fallbackStageAfterCancel<T extends StageLike>(stages: readonly T[]): T | undefined {
  const board = boardStages(stages);
  const scheduled = board.findIndex((s) => s.role === 'SCHEDULED');
  if (scheduled > 0) return board[scheduled - 1];
  return stageByRole(stages, 'NEW');
}

export type DeleteCheck = { ok: true } | { ok: false; message: string };

/**
 * Pode apagar esta etapa?
 *
 * Etapas com papel ficam: a automação depende delas (agendou → Avaliação
 * agendada). A clínica renomeia, recolore e reordena, mas não apaga.
 * Uma etapa com leads só sai dizendo para onde eles vão.
 */
export function canDeleteStage(
  stage: StageLike,
  leadCount: number,
  target?: StageLike | null,
): DeleteCheck {
  if (stage.role) {
    return {
      ok: false,
      message: `"${stage.name}" é usada pela integração com a agenda e os orçamentos. Dá para renomear, mas não apagar.`,
    };
  }
  if (leadCount > 0) {
    if (!target) {
      return { ok: false, message: `Escolha para qual etapa vão os ${leadCount} leads de "${stage.name}".` };
    }
    if (target.id === stage.id || isClosedStage(target)) {
      return { ok: false, message: 'Escolha uma etapa aberta do funil para receber os leads.' };
    }
  }
  return { ok: true };
}

/**
 * Cria o funil padrão e os motivos de perda da clínica, se faltarem.
 *
 * Idempotente: pode rodar a cada abertura do CRM. Duas abas abrindo o CRM pela
 * primeira vez ao mesmo tempo não duplicam nada — o lock de transação por
 * clínica faz a segunda esperar a primeira e encontrar tudo pronto.
 */
export async function ensureDefaultPipeline(db: TenantPrismaClient, tenantId: string): Promise<void> {
  const [stages, reasons] = await Promise.all([db.pipelineStage.count(), db.lostReason.count()]);
  if (stages > 0 && reasons > 0) return;

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-pipeline:${tenantId}`}))`;

    if ((await tx.pipelineStage.count({ where: { tenantId } })) === 0) {
      await tx.pipelineStage.createMany({
        data: DEFAULT_STAGES.map((s) => ({ tenantId, name: s.name, color: s.color, order: s.order, role: s.role })),
      });
    }
    if ((await tx.lostReason.count({ where: { tenantId } })) === 0) {
      await tx.lostReason.createMany({
        data: DEFAULT_LOST_REASONS.map((name, i) => ({ tenantId, name, order: (i + 1) * 10 })),
      });
    }
  });
}
