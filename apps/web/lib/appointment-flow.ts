/**
 * O caminho do paciente no dia do atendimento, como no Clínica nas Nuvens:
 * agendado → confirmado → na sala de espera → em atendimento → atendido.
 *
 * "Chegou" e "em atendimento" não são situações novas no banco: são as horas
 * gravadas no agendamento (`arrivedAt`, `startedAt`). Assim a confirmação pelo
 * WhatsApp, os relatórios e o CRM, que olham só a situação, não mudam.
 */

export type AppointmentStatusValue = 'SCHEDULED' | 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED' | 'ATTENDED' | 'MISSED';

export type Stage =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'ATTENDED'
  | 'MISSED'
  | 'CANCELLED'
  | 'RESCHEDULED';

export interface FlowLike {
  status: AppointmentStatusValue | string;
  arrivedAt?: Date | string | null;
  startedAt?: Date | string | null;
}

export function stageOf(a: FlowLike): Stage {
  if (a.status === 'ATTENDED' || a.status === 'MISSED' || a.status === 'CANCELLED' || a.status === 'RESCHEDULED') {
    return a.status;
  }
  if (a.startedAt) return 'IN_PROGRESS';
  if (a.arrivedAt) return 'ARRIVED';
  return a.status === 'CONFIRMED' ? 'CONFIRMED' : 'SCHEDULED';
}

export const STAGE_LABELS: Record<Stage, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  ARRIVED: 'Na sala de espera',
  IN_PROGRESS: 'Em atendimento',
  ATTENDED: 'Atendido',
  MISSED: 'Faltou',
  CANCELLED: 'Cancelado',
  RESCHEDULED: 'Remarcado',
};

export type FlowAction = 'confirm' | 'arrive' | 'start' | 'finish' | 'miss' | 'cancel' | 'reopen';

export const ACTION_LABELS: Record<FlowAction, string> = {
  confirm: 'Confirmar',
  arrive: 'Paciente chegou',
  start: 'Iniciar atendimento',
  finish: 'Finalizar atendimento',
  miss: 'Faltou',
  cancel: 'Cancelar',
  reopen: 'Voltar para agendado',
};

/**
 * O que dá para fazer em cada momento. A primeira é a ação principal (o botão
 * de destaque); as outras aparecem ao lado.
 */
export function actionsFor(stage: Stage): FlowAction[] {
  switch (stage) {
    case 'SCHEDULED':
      return ['arrive', 'confirm', 'miss', 'cancel'];
    case 'CONFIRMED':
      return ['arrive', 'miss', 'cancel'];
    case 'ARRIVED':
      return ['start', 'cancel', 'reopen'];
    case 'IN_PROGRESS':
      return ['finish', 'reopen'];
    case 'MISSED':
      // Faltou e depois avisou que não vem mais: dá para cancelar.
      return ['reopen', 'cancel'];
    case 'ATTENDED':
    case 'CANCELLED':
    case 'RESCHEDULED':
      return ['reopen'];
  }
}

export interface FlowChange {
  status?: AppointmentStatusValue;
  arrivedAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

/**
 * O que gravar para uma ação. `null` quando a ação não cabe no momento atual
 * (o botão nem apareceria, mas o servidor confere de novo).
 */
export function applyAction(a: FlowLike, action: FlowAction, now: Date): FlowChange | null {
  const stage = stageOf(a);
  if (!actionsFor(stage).includes(action)) return null;
  switch (action) {
    case 'confirm':
      return { status: 'CONFIRMED' };
    case 'arrive':
      return { arrivedAt: now };
    case 'start':
      return { startedAt: now, ...(a.arrivedAt ? {} : { arrivedAt: now }) };
    case 'finish':
      return { status: 'ATTENDED', finishedAt: now };
    case 'miss':
      return { status: 'MISSED', arrivedAt: null, startedAt: null, finishedAt: null };
    case 'cancel':
      return { status: 'CANCELLED', arrivedAt: null, startedAt: null, finishedAt: null };
    case 'reopen':
      return { status: 'SCHEDULED', arrivedAt: null, startedAt: null, finishedAt: null };
  }
}

/** Minutos desde que chegou até entrar (ou até agora, se ainda espera). */
export function waitingMinutes(a: { arrivedAt?: Date | string | null; startedAt?: Date | string | null }, now: Date = new Date()): number | null {
  if (!a.arrivedAt) return null;
  const fim = a.startedAt ? new Date(a.startedAt) : now;
  return Math.max(0, Math.floor((fim.getTime() - new Date(a.arrivedAt).getTime()) / 60_000));
}
