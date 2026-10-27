import type { AgendaRole } from './defaults';
import { fallbackStageAfterCancel, pipelineOf, progressIndex, stageByRole, type StageLike } from './pipeline';

/**
 * A integração automática do funil com a agenda e os orçamentos.
 *
 * Este arquivo só decide — é puro e testado por tabela. Quem busca o contexto
 * e grava é `notify.ts`. As regras estão na spec
 * (docs/specs/2026-10-07-crm-etapa1-leads-funil-design.md):
 *
 * 1. Cada evento tem uma etapa de destino — a do papel, em qualquer funil da
 *    clínica (docs/specs/2026-10-26-planos-teste-e-funis-design.md). Num
 *    outro funil, o card muda de funil: é a Captação passando para Agendados.
 * 2. No mesmo funil, avançar só para frente: se a recepção já pôs o card mais
 *    adiante, a automação não o puxa para trás.
 * 3. Voltar só no cancelamento ou falta, e só a partir de "Avaliação agendada":
 *    vai para "Desmarcou" (ou, no funil sem ela, uma coluna antes).
 * 4. Perder nunca é automático.
 * 5. Lead ganho ou perdido não é mexido, exceto quando o orçamento que o ganhou
 *    é reaberto.
 */

export type ClinicEvent =
  | { type: 'appointment.created'; patientId: string; appointmentId: string }
  | { type: 'appointment.rescheduled'; patientId: string; appointmentId: string }
  | { type: 'appointment.cancelled'; patientId: string; appointmentId: string }
  | { type: 'appointment.missed'; patientId: string; appointmentId: string }
  | { type: 'appointment.attended'; patientId: string; appointmentId: string }
  | { type: 'quote.created'; patientId: string; quoteId: string }
  | { type: 'quote.accepted'; patientId: string; quoteId: string }
  | { type: 'quote.reopened'; patientId: string; quoteId: string }
  | { type: 'quote.rejected'; patientId: string; quoteId: string; reason?: string | null }
  | { type: 'quote.deleted'; patientId: string; quoteId: string };

export interface LeadSnapshot {
  id: string;
  stageId: string;
  wonAt: Date | null;
  lostAt: Date | null;
}

export interface AutomationContext {
  /** Todas as etapas da clínica, de todos os funis. */
  stages: readonly StageLike[];
  lead: LeadSnapshot;
  /** O paciente tem outro agendamento futuro, sem contar o deste evento. */
  hasFutureAppointment: boolean;
  /** O paciente tem orçamento em aberto, sem contar o deste evento. */
  hasOpenQuote: boolean;
  /** Este lead foi ganho por este orçamento (só importa em `quote.reopened`). */
  wonByThisQuote: boolean;
  /** Total do orçamento do evento, em centavos (só importa em `quote.accepted`). */
  quoteTotalCents?: number;
}

export interface AutomationTask {
  text: string;
  /** Daqui a quantos dias, às 10h da clínica. */
  inDays: number;
}

export interface AutomationPlan {
  moveTo?: string;
  /** Valor do negócio, gravado quando o orçamento é aprovado. */
  wonValueCents?: number;
  tasks: AutomationTask[];
  /**
   * Tarefas automáticas que este evento resolve (pelo texto). Agendou de novo?
   * "Reagendar avaliação" está feita. Só as criadas pela automação — a tarefa
   * que alguém da equipe escreveu, só a própria equipe conclui.
   */
  completes?: string[];
}

export const TASK_REAGENDAR = 'Reagendar avaliação';
export const TASK_FALTOU = 'Faltou na avaliação, reagendar';
/**
 * Textos antigos das tarefas automáticas, de antes da troca do travessão.
 * Tarefa aberta com o texto antigo ainda precisa ser concluída sozinha.
 */
const OLD_TASK_TEXT: Record<string, string> = { [TASK_FALTOU]: 'Faltou na avaliação \u2014 reagendar' };

/** Os textos a concluir, com os antigos de cada um. */
export function withOldTaskTexts(texts: readonly string[]): string[] {
  return texts.flatMap((t) => (OLD_TASK_TEXT[t] ? [t, OLD_TASK_TEXT[t]] : [t]));
}
export const TASK_ENVIAR_ORCAMENTO = 'Enviar orçamento';
export const TASK_RETOMAR = 'Retomar negociação';

const NADA: AutomationPlan = { tasks: [] };

const aberto = (lead: LeadSnapshot) => !lead.wonAt && !lead.lostAt;

/**
 * Avança para a etapa do papel. Noutro funil, vai (é a passagem de funil); no
 * mesmo, só se ela estiver à frente da atual.
 */
function avancar(ctx: AutomationContext, role: AgendaRole): string | undefined {
  const destino = stageByRole(ctx.stages, role);
  if (!destino) return undefined;
  const atual = ctx.stages.find((s) => s.id === ctx.lead.stageId);
  if (atual?.pipelineId !== undefined && destino.pipelineId !== atual.pipelineId) return destino.id;
  const funil = pipelineOf(ctx.stages, ctx.lead.stageId);
  return progressIndex(funil, destino.id) > progressIndex(funil, ctx.lead.stageId) ? destino.id : undefined;
}

export function planForEvent(ctx: AutomationContext, event: ClinicEvent): AutomationPlan {
  const { lead } = ctx;
  const atual = ctx.stages.find((s) => s.id === lead.stageId);

  if (event.type === 'quote.reopened') {
    if (!lead.wonAt || !ctx.wonByThisQuote) return NADA;
    return { moveTo: stageByRole(ctx.stages, 'NEGOTIATION')?.id, tasks: [] };
  }

  if (!aberto(lead)) return NADA;

  switch (event.type) {
    case 'appointment.created': {
      // De "Desmarcou" volta para "Avaliação agendada", mesmo estando à frente no quadro.
      const moveTo = atual?.role === 'CANCELLED' ? stageByRole(ctx.stages, 'SCHEDULED')?.id : avancar(ctx, 'SCHEDULED');
      return { moveTo, tasks: [], completes: [TASK_REAGENDAR, TASK_FALTOU] };
    }

    case 'appointment.rescheduled':
      // A data nova aparece sozinha no card (lida ao vivo da agenda).
      return NADA;

    case 'appointment.cancelled':
    case 'appointment.missed': {
      if (atual?.role !== 'SCHEDULED' || ctx.hasFutureAppointment) return NADA;
      return {
        moveTo: (stageByRole(ctx.stages, 'CANCELLED') ?? fallbackStageAfterCancel(pipelineOf(ctx.stages, lead.stageId)))?.id,
        tasks: [{ text: event.type === 'appointment.missed' ? TASK_FALTOU : TASK_REAGENDAR, inDays: 1 }],
      };
    }

    case 'appointment.attended': {
      // Veio, mesmo depois de ter desmarcado: "Compareceu".
      const moveTo = atual?.role === 'CANCELLED' ? stageByRole(ctx.stages, 'ATTENDED')?.id : avancar(ctx, 'ATTENDED');
      return {
        moveTo,
        tasks: ctx.hasOpenQuote ? [] : [{ text: TASK_ENVIAR_ORCAMENTO, inDays: 1 }],
        completes: [TASK_REAGENDAR, TASK_FALTOU],
      };
    }

    case 'quote.created':
      return { moveTo: avancar(ctx, 'NEGOTIATION'), tasks: [], completes: [TASK_ENVIAR_ORCAMENTO, TASK_RETOMAR] };

    case 'quote.accepted':
      return {
        // O "Fechou" do funil em que o card está.
        moveTo: stageByRole(pipelineOf(ctx.stages, lead.stageId), 'WON')?.id,
        wonValueCents: ctx.quoteTotalCents,
        tasks: [],
        completes: [TASK_REAGENDAR, TASK_FALTOU, TASK_ENVIAR_ORCAMENTO, TASK_RETOMAR],
      };

    case 'quote.rejected':
    case 'quote.deleted':
      return ctx.hasOpenQuote ? NADA : { tasks: [{ text: TASK_RETOMAR, inDays: 1 }] };
  }
}
