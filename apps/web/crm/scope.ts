import 'server-only';

import { levelAllows, type Level } from '@/lib/crm-rights';
import { guardCrmAction, type CrmActionGuard, type CrmCapability, type CrmContext } from './guard';
import { conversationScope, leadScope } from './scope-rules';

export { conversationScope, leadScope, taskScope } from './scope-rules';

/**
 * O que cada pessoa enxerga no CRM. Gestor e Atendente veem tudo; o Atendente
 * "só os dele" vê o que é dele e o que ainda está sem responsável (o nível
 * "só os seus" do Kommo, sem deixar a fila sem dono invisível).
 *
 * Toda lista, contagem e ação que mira um negócio ou conversa passa por aqui —
 * esconder na tela não basta, a action também confere.
 */

export const OUT_OF_SCOPE_MESSAGE = 'Este negócio é de outra pessoa da equipe. Peça para um gestor transferir para você.';
const NO_EDIT_MESSAGE = 'Seu cargo no CRM não permite editar negócios. Fale com um gestor.';

/** O alcance que vale para a action: gravar usa "editar"; só ler usa "ver". */
const alcance = (g: CrmContext, write: boolean | undefined): Level => (write === false ? g.rights.leads.view : g.rights.leads.edit);

/**
 * A guarda da action, mais o quadro de permissões para este negócio: ler pede
 * "ver", gravar pede "editar" — "se responsável" é o dele ou o sem responsável.
 */
export async function guardLead(
  capability: CrmCapability,
  leadId: string,
  opts?: { write?: boolean },
): Promise<CrmActionGuard> {
  const g = await guardCrmAction(capability, opts);
  if (!g.ok) return g;
  const lv = alcance(g, opts?.write);
  if (lv === 'all') return g;
  if (lv === 'none') return { ok: false, message: NO_EDIT_MESSAGE };
  const lead = await g.db.lead.findFirst({ where: { id: leadId, ...leadScope({ userId: g.userId, ownOnly: true }) }, select: { id: true } });
  return lead ? g : { ok: false, message: OUT_OF_SCOPE_MESSAGE };
}

/** A guarda da action, mais o quadro de permissões para esta conversa (responder é editar). */
export async function guardConversation(
  capability: CrmCapability,
  conversationId: string,
  opts?: { write?: boolean },
): Promise<CrmActionGuard> {
  const g = await guardCrmAction(capability, opts);
  if (!g.ok) return g;
  const lv = alcance(g, opts?.write);
  if (lv === 'all') return g;
  if (lv === 'none') return { ok: false, message: 'Seu cargo no CRM não permite responder conversas. Fale com um gestor.' };
  const conv = await g.db.conversation.findFirst({
    where: { id: conversationId, ...conversationScope({ userId: g.userId, ownOnly: true }) },
    select: { id: true },
  });
  return conv ? g : { ok: false, message: 'Esta conversa é de outra pessoa da equipe. Peça para um gestor transferir para você.' };
}

/** Pode excluir este negócio? Devolve a mensagem quando não. */
export async function deleteBlocked(g: CrmContext, leadId: string): Promise<string | null> {
  const lv = g.rights.leads.delete;
  if (lv === 'all') return null;
  if (lv === 'none') return 'Seu cargo no CRM não permite excluir negócios.';
  const lead = await g.db.lead.findFirst({ where: { id: leadId }, select: { assignedToId: true } });
  return lead && levelAllows(lv, g.userId, lead.assignedToId) ? null : OUT_OF_SCOPE_MESSAGE;
}

/** Dos negócios escolhidos, os que o alcance deixa mexer (ações em massa). */
export async function idsWithin(g: CrmContext, ids: string[], lv: Level): Promise<string[]> {
  if (lv === 'all') return ids;
  if (lv === 'none' || ids.length === 0) return [];
  const rows = await g.db.lead.findMany({
    where: { id: { in: ids }, ...leadScope({ userId: g.userId, ownOnly: true }) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
