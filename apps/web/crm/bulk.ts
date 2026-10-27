import type { TenantPrismaClient } from '@clinicaiq/db';
import { leadScope } from './scope-rules';
import { leadWhere, statusWhere, type ListStatus } from './board-data';
import type { CrmContext } from './guard';
import { setLeadFields } from './lead-fields';
import { moveLead, renumberStage, setTags, softDeleteLead, updateLead } from './leads';
import { stageByRole } from './pipeline';
import { createTask } from './tasks';
import type { BoardFilters } from './types';

/**
 * Ações em massa na lista de leads, como no Kommo. Cada lead passa pelas
 * mesmas regras da ação de um por um (histórico, etapa fechada, equipe ativa).
 * Mover em massa não agenda as automações das etapas, a não ser que a pessoa
 * peça. Quem chama já passou por `guardCrmAction`; excluir exige `crm_config`.
 */

import { MAX_BULK } from './bulk-limits';

export { MAX_BULK };

export type BulkAction =
  | { type: 'move'; stageId: string; runAutomations: boolean }
  | { type: 'assign'; userId: string | null }
  | { type: 'addTag'; tagId: string }
  | { type: 'removeTag'; tagId: string }
  | { type: 'task'; text: string; dueAt: Date; assignedToId: string | null }
  | { type: 'field'; fieldId: string; value: unknown }
  | { type: 'lose'; lostReasonId: string }
  | { type: 'delete' };

/** Quais leads: os marcados na tela, ou todos os da busca (os mesmos filtros e situação da lista). */
export type BulkTarget = { ids: string[] } | { filters: BoardFilters; status: ListStatus };

export interface BulkResult {
  done: number;
  failed: { id: string; message: string }[];
}

export async function resolveTargets(ctx: CrmContext, target: BulkTarget): Promise<string[]> {
  if ('ids' in target) {
    const ids = [...new Set(target.ids.filter((x) => typeof x === 'string'))].slice(0, MAX_BULK);
    if (!ids.length) return [];
    const rows = await ctx.db.lead.findMany({ where: { id: { in: ids }, deletedAt: null, ...(leadScope(ctx) ?? {}) }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await ctx.db.lead.findMany({
    where: { ...leadWhere(ctx, target.filters), ...statusWhere(target.status) },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_BULK,
  });
  return rows.map((r) => r.id);
}

async function tagsOf(db: TenantPrismaClient, leadId: string) {
  return (await db.leadTagOnLead.findMany({ where: { leadId }, select: { tagId: true } })).map((t) => t.tagId);
}

export async function runBulk(ctx: CrmContext, ids: string[], action: BulkAction): Promise<BulkResult> {
  const actor = { tenantId: ctx.tenantId, userId: ctx.userId };
  const result: BulkResult = { done: 0, failed: [] };

  // Conferido uma vez, antes de mexer em qualquer lead.
  let lostStageOf = new Map<string, string>();
  if (action.type === 'move') {
    const alvo = await ctx.db.pipelineStage.findFirst({ where: { id: action.stageId }, select: { id: true } });
    if (!alvo) return { done: 0, failed: ids.map((id) => ({ id, message: 'Etapa não encontrada.' })) };
  }
  if (action.type === 'addTag' || action.type === 'removeTag') {
    const tag = await ctx.db.leadTag.findFirst({ where: { id: action.tagId }, select: { id: true } });
    if (!tag) return { done: 0, failed: ids.map((id) => ({ id, message: 'Tag não encontrada.' })) };
  }
  if (action.type === 'assign' && action.userId) {
    const u = await ctx.db.user.findFirst({ where: { id: action.userId, active: true }, select: { id: true } });
    if (!u) return { done: 0, failed: ids.map((id) => ({ id, message: 'Essa pessoa não está mais na equipe.' })) };
  }
  if (action.type === 'lose') {
    // Cada lead perde no "Perdeu" do próprio funil.
    const etapas = await ctx.db.pipelineStage.findMany({ select: { id: true, name: true, order: true, pipelineId: true, role: true } });
    const leads = await ctx.db.lead.findMany({ where: { id: { in: ids } }, select: { id: true, stage: { select: { pipelineId: true } } } });
    lostStageOf = new Map(
      leads.flatMap((l) => {
        const perdeu = stageByRole(etapas.filter((s) => s.pipelineId === l.stage.pipelineId), 'LOST');
        return perdeu ? [[l.id, perdeu.id] as const] : [];
      }),
    );
  }

  const colunasMexidas = new Set<string>();
  for (const id of ids) {
    let r: { ok: true } | { ok: false; message: string };
    switch (action.type) {
      case 'move':
        r = await moveLead(ctx.db, actor, id, { stageId: action.stageId, automations: action.runAutomations, renumber: false, origin: { event: 'bulk' } });
        if (r.ok) colunasMexidas.add(action.stageId);
        break;
      case 'assign':
        r = await updateLead(ctx.db, actor, id, { assignedToId: action.userId });
        break;
      case 'addTag': {
        const atuais = await tagsOf(ctx.db, id);
        r = atuais.includes(action.tagId) ? { ok: true } : await setTags(ctx.db, actor, id, [...atuais, action.tagId]);
        break;
      }
      case 'removeTag': {
        const atuais = await tagsOf(ctx.db, id);
        r = atuais.includes(action.tagId) ? await setTags(ctx.db, actor, id, atuais.filter((t) => t !== action.tagId)) : { ok: true };
        break;
      }
      case 'task':
        r = await createTask(ctx.db, actor, id, { text: action.text, dueAt: action.dueAt, assignedToId: action.assignedToId });
        break;
      case 'field':
        r = await setLeadFields(ctx.db, actor, id, { [action.fieldId]: action.value });
        break;
      case 'lose': {
        const perdeu = lostStageOf.get(id);
        r = perdeu
          ? await moveLead(ctx.db, actor, id, { stageId: perdeu, lostReasonId: action.lostReasonId, renumber: false, origin: { event: 'bulk' } })
          : { ok: false, message: 'Funil sem a etapa Perdeu.' };
        break;
      }
      case 'delete':
        r = await softDeleteLead(ctx.db, actor, id);
        break;
    }
    if (r.ok) result.done += 1;
    else result.failed.push({ id, message: r.message });
  }
  // Uma renumeração por coluna, no fim (e não a cada lead).
  for (const stageId of colunasMexidas) await renumberStage(ctx.db, ctx.tenantId, stageId);
  return result;
}

/** "312 movidos; 3 não: lead fechado (2), etapa fechada (1)". */
export function bulkSummary(done: number, failed: BulkResult['failed'], verbo: string): string {
  if (!failed.length) return `${done} ${verbo}.`;
  const motivos = new Map<string, number>();
  for (const f of failed) motivos.set(f.message, (motivos.get(f.message) ?? 0) + 1);
  const lista = [...motivos].map(([m, n]) => `${m.replace(/\.$/, '').toLowerCase()} (${n})`).join(', ');
  return `${done} ${verbo}; ${failed.length} não: ${lista}.`;
}
