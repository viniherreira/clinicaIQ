/**
 * Os cargos dentro do CRM, à parte do perfil na clínica — como os papéis do
 * Kommo. O perfil diz o que a pessoa faz na clínica (recepção, profissional);
 * o cargo diz o que ela vê e mexe no CRM.
 *
 * - Gestor: vê tudo e configura (funis, robôs, modelos, WhatsApp, equipe e
 *   distribuição), exclui, importa e exporta.
 * - Atendente: atende e move os negócios de todos, sem mexer nas configurações.
 * - Atendente (só os dele): o nível "só os seus" do Kommo — vê os negócios,
 *   conversas e tarefas de que é responsável, mais os ainda sem responsável
 *   (para nada ficar perdido quando a distribuição está desligada).
 *
 * Puro: a guarda, o menu e a tela de Equipe leem daqui.
 */

import type { Role } from './permissions';

export type CrmRole = 'MANAGER' | 'AGENT' | 'AGENT_OWN';

export const CRM_ROLES: readonly CrmRole[] = ['MANAGER', 'AGENT', 'AGENT_OWN'];

export const CRM_ROLE_INFO: Record<CrmRole, { label: string; description: string }> = {
  MANAGER: {
    label: 'Gestor',
    description: 'Vê tudo e configura o CRM: funis, robôs, modelos, WhatsApp, equipe e distribuição.',
  },
  AGENT: {
    label: 'Atendente',
    description: 'Atende e move os negócios de toda a equipe. Não mexe nas configurações.',
  },
  AGENT_OWN: {
    label: 'Atendente (só os dele)',
    description: 'Vê só os negócios e conversas de que é responsável, e os que ainda estão sem responsável.',
  },
};

export function isCrmRole(value: unknown): value is CrmRole {
  return typeof value === 'string' && (CRM_ROLES as readonly string[]).includes(value);
}

/** O cargo que vale: o dono é sempre Gestor; sem escolha, o padrão do perfil. */
export function effectiveCrmRole(role: Role | string | null | undefined, stored: string | null | undefined): CrmRole {
  if (role === 'OWNER') return 'MANAGER';
  if (isCrmRole(stored)) return stored;
  return role === 'ADMIN' ? 'MANAGER' : 'AGENT';
}

/** O dono não troca de cargo: ninguém pode tirar dele a configuração do CRM. */
export const crmRoleLocked = (role: Role | string | null | undefined) => role === 'OWNER';

/** Configura o CRM (o antigo `crm_config`). */
export const isCrmManager = (crmRole: CrmRole) => crmRole === 'MANAGER';

/** Vê só o que é dele (e o sem responsável). */
export const seesOnlyOwn = (crmRole: CrmRole) => crmRole === 'AGENT_OWN';

/** Quem vê só os seus enxerga um negócio ou conversa com este responsável? */
export function canSeeAssigned(viewer: { userId: string; crmRole: CrmRole }, assignedToId: string | null | undefined): boolean {
  if (!seesOnlyOwn(viewer.crmRole)) return true;
  return !assignedToId || assignedToId === viewer.userId;
}
