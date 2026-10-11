/**
 * A situação de tarefa de um lead, o hábito central do funil: todo lead aberto
 * precisa de uma próxima ação. Calculada na leitura, nunca gravada — assim
 * "atrasada" vira atrasada sozinha, sem rotina rodando de madrugada.
 */
export type TaskStatus =
  | { kind: 'none' }
  | { kind: 'overdue'; dueAt: Date; count: number }
  | { kind: 'upcoming'; dueAt: Date };

export interface PendingTaskLike {
  dueAt: Date;
  completedAt: Date | null;
}

export function taskStatus(tasks: readonly PendingTaskLike[], now: Date = new Date()): TaskStatus {
  const pendentes = tasks.filter((t) => !t.completedAt).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  if (pendentes.length === 0) return { kind: 'none' };

  const atrasadas = pendentes.filter((t) => t.dueAt.getTime() < now.getTime());
  if (atrasadas.length > 0) return { kind: 'overdue', dueAt: atrasadas[0].dueAt, count: atrasadas.length };

  return { kind: 'upcoming', dueAt: pendentes[0].dueAt };
}
