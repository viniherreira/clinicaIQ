/**
 * Formas que viajam do servidor para as telas do CRM. Só dados prontos para
 * mostrar: telefone já mascarado, datas como texto ISO, nada cifrado.
 */

export interface BoardStage {
  id: string;
  name: string;
  color: string;
  role: string | null;
}

export interface BoardTag {
  id: string;
  name: string;
  color: string;
}

export interface BoardPerson {
  id: string;
  name: string;
}

export type BoardTaskStatus =
  | { kind: 'none' }
  | { kind: 'overdue'; dueAt: string; count: number }
  | { kind: 'upcoming'; dueAt: string };

export interface BoardLead {
  id: string;
  stageId: string;
  title: string | null;
  name: string;
  phoneMasked: string;
  source: string;
  interest: string | null;
  valueCents: number | null;
  tags: BoardTag[];
  assignee: BoardPerson | null;
  task: BoardTaskStatus;
  stageEnteredAt: string;
  /** Hora de parede da agenda, em ISO. */
  nextAppointment: { startTime: string; professionalName: string } | null;
  openQuote: { number: number; totalCents: number } | null;
  wonAt: string | null;
  lostAt: string | null;
}

export interface BoardFilters {
  q: string;
  /** 'all' (padrão), 'me' ou o id de alguém da equipe. */
  resp: string;
  tarefa: '' | 'none' | 'overdue';
  tag: string;
  origem: string;
}

export interface LostReasonOption {
  id: string;
  name: string;
}
