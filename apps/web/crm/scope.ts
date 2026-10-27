import 'server-only';

import { guardCrmAction, type CrmActionGuard, type CrmCapability } from './guard';
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

/** A guarda da action, mais: este negócio é de quem chama (ou sem responsável)? */
export async function guardLead(
  capability: CrmCapability,
  leadId: string,
  opts?: { write?: boolean },
): Promise<CrmActionGuard> {
  const g = await guardCrmAction(capability, opts);
  if (!g.ok || !g.ownOnly) return g;
  const lead = await g.db.lead.findFirst({ where: { id: leadId, ...leadScope(g) }, select: { id: true } });
  return lead ? g : { ok: false, message: OUT_OF_SCOPE_MESSAGE };
}

/** A guarda da action, mais: esta conversa é de quem chama (ou sem responsável)? */
export async function guardConversation(
  capability: CrmCapability,
  conversationId: string,
  opts?: { write?: boolean },
): Promise<CrmActionGuard> {
  const g = await guardCrmAction(capability, opts);
  if (!g.ok || !g.ownOnly) return g;
  const conv = await g.db.conversation.findFirst({ where: { id: conversationId, ...conversationScope(g) }, select: { id: true } });
  return conv ? g : { ok: false, message: 'Esta conversa é de outra pessoa da equipe. Peça para um gestor transferir para você.' };
}
