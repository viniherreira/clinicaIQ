import type { TaskOrigin, TenantPrismaClient } from '@clinicaiq/db';
import type { Actor } from './leads';

/**
 * Tarefas do lead: a próxima ação, com data, hora e responsável.
 * Criar e concluir registram no histórico na mesma transação.
 */

export interface NewTaskInput {
  text: string;
  dueAt: Date;
  /** Padrão: o responsável do lead; sem responsável, quem criou. */
  assignedToId?: string | null;
  origin?: TaskOrigin;
}

export async function createTask(
  db: TenantPrismaClient,
  actor: Actor,
  leadId: string,
  input: NewTaskInput,
): Promise<{ ok: true; taskId: string } | { ok: false; message: string }> {
  const { tenantId } = actor;
  const text = input.text.trim();
  if (!text) return { ok: false, message: 'Escreva o que precisa ser feito.' };

  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, tenantId, deletedAt: null },
      select: { id: true, assignedToId: true },
    });
    if (!lead) return { ok: false as const, message: 'Lead não encontrado.' };

    const assignedToId = input.assignedToId || lead.assignedToId || actor.userId;
    if (!assignedToId) return { ok: false as const, message: 'Escolha quem vai fazer a tarefa.' };
    const pessoa = await tx.user.findFirst({ where: { id: assignedToId, tenantId, active: true }, select: { id: true } });
    if (!pessoa) return { ok: false as const, message: 'Essa pessoa não está mais na equipe.' };

    const task = await tx.leadTask.create({
      data: {
        tenantId,
        leadId,
        text,
        dueAt: input.dueAt,
        assignedToId,
        origin: input.origin ?? 'MANUAL',
        createdById: actor.userId,
      },
    });
    await tx.leadActivity.create({
      data: {
        tenantId,
        leadId,
        type: 'TASK_CREATED',
        actorId: actor.userId,
        data: { taskId: task.id, text, dueAt: input.dueAt.toISOString(), origin: task.origin },
      },
    });
    return { ok: true as const, taskId: task.id };
  });
}

export async function completeTask(
  db: TenantPrismaClient,
  actor: Actor,
  taskId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { tenantId } = actor;
  return db.$transaction(async (tx) => {
    const task = await tx.leadTask.findFirst({ where: { id: taskId, tenantId } });
    if (!task) return { ok: false as const, message: 'Tarefa não encontrada.' };
    if (task.completedAt) return { ok: true as const };

    await tx.leadTask.update({
      where: { id: task.id, tenantId },
      data: { completedAt: new Date(), completedById: actor.userId },
    });
    await tx.leadActivity.create({
      data: { tenantId, leadId: task.leadId, type: 'TASK_COMPLETED', actorId: actor.userId, data: { taskId: task.id } },
    });
    return { ok: true as const };
  });
}
