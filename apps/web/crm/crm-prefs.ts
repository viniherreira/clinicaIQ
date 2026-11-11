/**
 * Preferências do CRM da clínica (Configurações › Geral e Conversas), como as
 * "Configurações de chat" do Kommo. Guardadas em `Tenant.settings.crm`. Puro:
 * lê o JSON aceitando o que vier e caindo no padrão.
 */

export interface CrmPrefs {
  /** Número novo que escreve vira negócio sozinho, em Novo. Desligado: a conversa fica "sem negócio" para a equipe decidir. */
  autoLead: boolean;
  /**
   * Quem já teve negócio fechado (ganho ou perdido) e escreve de novo: a
   * conversa volta para o último negócio, em vez de abrir um novo. É a opção
   * "adicione ao perfil existente, mesmo em etapa desativada" do Kommo.
   */
  reuseClosedLead: boolean;
  /** Põe o nome de quem respondeu na mensagem ("*Ana:*"), como o "Mostrar nome do remetente" do Kommo. */
  senderName: boolean;
  /**
   * Tags sozinhas no lead: o canal de entrada (whatsapp, instagram, facebook,
   * site, indicação) e os procedimentos que a pessoa citou (implante,
   * clareamento…). Ver `crm/auto-tags.ts`.
   */
  autoTags: boolean;
}

export const CRM_PREFS_DEFAULTS: CrmPrefs = { autoLead: true, reuseClosedLead: false, senderName: false, autoTags: true };

export function readCrmPrefs(settings: unknown): CrmPrefs {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).crm : undefined;
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = CRM_PREFS_DEFAULTS;
  const bool = (v: unknown, padrao: boolean) => (typeof v === 'boolean' ? v : padrao);
  return {
    autoLead: bool(o.autoLead, d.autoLead),
    reuseClosedLead: bool(o.reuseClosedLead, d.reuseClosedLead),
    senderName: bool(o.senderName, d.senderName),
    autoTags: bool(o.autoTags, d.autoTags),
  };
}

/**
 * A assinatura na mensagem: vai na primeira de quem responde e de novo depois
 * que o contato escreve ou outra pessoa da equipe responde (a regra do Kommo).
 * `last` é a última mensagem da conversa.
 */
export function needsSignature(
  last: { direction: string; origin: string; sentById: string | null } | null,
  userId: string,
): boolean {
  if (!last) return true;
  return !(last.direction === 'OUTBOUND' && last.origin === 'CRM' && last.sentById === userId);
}

/** O texto com a assinatura em negrito do WhatsApp. */
export const signText = (name: string, text: string) => (text ? `*${name.trim()}:*\n${text}` : `*${name.trim()}*`);
