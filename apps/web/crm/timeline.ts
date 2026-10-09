/**
 * O histórico do lead em frases. Puro: recebe os registros e os nomes já
 * resolvidos (etapas, tags, pessoas, motivos) e devolve o que a tela mostra.
 */

export interface ActivityLike {
  id: string;
  type: string;
  data: unknown;
  actorId: string | null;
  createdAt: Date;
}

export interface TimelineNames {
  stages: Map<string, string>;
  tags: Map<string, string>;
  people: Map<string, string>;
  reasons: Map<string, string>;
  /** A etapa de ganho: chegar nela vira "Negócio fechado". */
  wonStageId: string | null;
}

export type TimelineKind = 'event' | 'note' | 'task' | 'clinic' | 'won' | 'lost';

export interface TimelineEntry {
  id: string;
  at: string;
  who: string;
  kind: TimelineKind;
  text: string;
  /** Tarefa ligada ao registro, para o botão "Concluir" no lugar certo. */
  taskId?: string;
}

const CLINIC_TEXT: Record<string, string> = {
  'appointment.created': 'Avaliação agendada na agenda',
  'appointment.rescheduled': 'Avaliação remarcada na agenda',
  'appointment.cancelled': 'Avaliação cancelada na agenda',
  'appointment.missed': 'Paciente faltou na avaliação',
  'appointment.attended': 'Paciente compareceu à avaliação',
  'quote.created': 'Orçamento criado',
  'quote.accepted': 'Orçamento aprovado',
  'quote.reopened': 'Orçamento reaberto',
  'quote.rejected': 'Orçamento recusado pelo paciente',
  'quote.deleted': 'Orçamento excluído',
};

const SOURCE: Record<string, string> = {
  WHATSAPP: 'WhatsApp', INDICACAO: 'Indicação', INSTAGRAM: 'Instagram', SITE: 'Site', MANUAL: 'cadastro manual', OUTRO: 'outra origem',
};

export function toTimeline(activities: readonly ActivityLike[], names: TimelineNames): TimelineEntry[] {
  return activities.map((a) => {
    const d = (a.data ?? {}) as Record<string, string | undefined>;
    const who = a.actorId ? names.people.get(a.actorId) ?? 'Alguém da equipe' : 'Automação';
    const stage = (id?: string) => (id ? names.stages.get(id) ?? 'uma etapa removida' : '');
    const base = { id: a.id, at: a.createdAt.toISOString(), who };

    switch (a.type) {
      case 'CREATED':
        return { ...base, kind: 'event', text: `Lead criado${d.source ? ` (${SOURCE[d.source] ?? d.source})` : ''}` };
      case 'STAGE_CHANGED': {
        const motivo = d.event && CLINIC_TEXT[d.event] ? ` — ${CLINIC_TEXT[d.event].toLowerCase()}` : '';
        if (d.to && d.to === names.wonStageId) {
          return { ...base, kind: 'won', text: `Negócio fechado${motivo}` };
        }
        return { ...base, kind: 'event', text: `Moveu de ${stage(d.from)} para ${stage(d.to)}${motivo}` };
      }
      case 'LOST':
        return {
          ...base,
          kind: 'lost',
          text: `Marcado como perdido${d.lostReasonId ? `: ${names.reasons.get(d.lostReasonId) ?? 'motivo removido'}` : ''}`,
        };
      case 'REOPENED':
        return { ...base, kind: 'event', text: `Reaberto em ${stage(d.to)}` };
      case 'NOTE':
        return { ...base, kind: 'note', text: d.text ?? '' };
      case 'TAG_ADDED':
        return { ...base, kind: 'event', text: `Tag adicionada: ${names.tags.get(d.tagId ?? '') ?? 'removida'}` };
      case 'TAG_REMOVED':
        return { ...base, kind: 'event', text: `Tag retirada: ${names.tags.get(d.tagId ?? '') ?? 'removida'}` };
      case 'ASSIGNED':
        return { ...base, kind: 'event', text: d.to ? `Responsável: ${names.people.get(d.to) ?? 'alguém da equipe'}` : 'Ficou sem responsável' };
      case 'TASK_CREATED':
        return { ...base, kind: 'task', text: `Tarefa: ${d.text ?? ''}`, taskId: d.taskId };
      case 'TASK_COMPLETED':
        return { ...base, kind: 'event', text: d.text ? `Tarefa concluída: ${d.text}` : 'Tarefa concluída', taskId: d.taskId };
      case 'CONVERTED':
        return { ...base, kind: 'event', text: d.how === 'linked' ? 'Ligado à ficha de paciente' : 'Convertido em paciente' };
      case 'CLINIC_EVENT':
        return {
          ...base,
          kind: 'clinic',
          text: `${CLINIC_TEXT[d.event ?? ''] ?? 'Movimento na clínica'}${d.reason ? `: “${d.reason}”` : ''}`,
        };
      default:
        return { ...base, kind: 'event', text: a.type };
    }
  });
}
