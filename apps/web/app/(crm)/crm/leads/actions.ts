'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@clinicaiq/db';
import { effectiveStatus, parseFilters, parseListParams } from '@/crm/board-data';
import { bulkSummary, resolveTargets, runBulk, type BulkAction } from '@/crm/bulk';
import { clinicLocalToInstant } from '@/crm/clock';
import { guardCrmAction } from '@/crm/guard';

/**
 * Ações em massa da lista de leads. Os leads vêm marcados na tela (ids) ou
 * como "todos os da busca" (os parâmetros da URL, lidos aqui do mesmo jeito
 * que a lista lê). Regras em `crm/bulk.ts`.
 */

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), stageId: z.string().min(1), runAutomations: z.boolean() }),
  z.object({ type: z.literal('assign'), userId: z.string().nullable() }),
  z.object({ type: z.literal('addTag'), tagId: z.string().min(1) }),
  z.object({ type: z.literal('removeTag'), tagId: z.string().min(1) }),
  z.object({ type: z.literal('task'), text: z.string().trim().min(1, 'Escreva a tarefa.').max(300), dueLocal: z.string(), assignedToId: z.string().nullable() }),
  z.object({ type: z.literal('field'), fieldId: z.string().min(1), value: z.unknown() }),
  z.object({ type: z.literal('lose'), lostReasonId: z.string().min(1, 'Escolha o motivo da perda.') }),
  z.object({ type: z.literal('delete') }),
]);

const inputSchema = z.object({
  target: z.union([z.object({ ids: z.array(z.string()).max(2000) }), z.object({ search: z.record(z.string()) })]),
  action: actionSchema,
});

const VERBO: Record<BulkAction['type'], string> = {
  move: 'movidos',
  assign: 'com o novo responsável',
  addTag: 'com a tag',
  removeTag: 'sem a tag',
  task: 'com a tarefa',
  field: 'atualizados',
  lose: 'marcados como perdidos',
  delete: 'excluídos',
};

export async function bulkLeadsAction(
  input: z.input<typeof inputSchema>,
): Promise<{ ok: true; message: string; done: number } | { ok: false; message: string }> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { target, action: a } = parsed.data;
  if (a.type === 'delete' && !g.manager) return { ok: false, message: 'Só quem é Gestor no CRM pode excluir leads.' };

  let action: BulkAction;
  if (a.type === 'task') {
    const dueAt = clinicLocalToInstant(a.dueLocal);
    if (!dueAt) return { ok: false, message: 'Escolha o dia e a hora da tarefa.' };
    action = { type: 'task', text: a.text, dueAt, assignedToId: a.assignedToId };
  } else {
    action = a as BulkAction;
  }

  const ids = await resolveTargets(
    g,
    'ids' in target
      ? { ids: target.ids }
      : (() => {
          const filters = parseFilters(target.search);
          return { filters, status: effectiveStatus(parseListParams(target.search).status, filters) };
        })(),
  );
  if (!ids.length) return { ok: false, message: 'Nenhum lead para mudar.' };

  const r = await runBulk(g, ids, action);
  await prisma.auditLog.create({
    data: {
      tenantId: g.tenantId,
      userId: g.userId,
      action: `LEADS_BULK_${a.type.toUpperCase()}`,
      entity: 'Lead',
      entityId: 'bulk',
      metadata: { count: r.done, failed: r.failed.length },
    },
  });
  revalidatePath('/crm');
  revalidatePath('/crm/leads');
  return { ok: true, message: bulkSummary(r.done, r.failed, VERBO[a.type]), done: r.done };
}
