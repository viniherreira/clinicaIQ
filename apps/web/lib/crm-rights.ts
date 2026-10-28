/**
 * As permissões de cada pessoa no CRM, no formato da Gestão de usuários do
 * Kommo: para cada coisa (negócios, tarefas), o que pode fazer (criar, ver,
 * editar, excluir, exportar) e em que alcance (negado, se responsável,
 * permitido).
 *
 * O cargo (`lib/crm-roles.ts`) é um conjunto pronto destas permissões. Quem
 * precisa de outro desenho grava as suas em `users.crmRights` — aí o cargo
 * aparece como "Personalizado". Puro: a guarda, as listas e a tela de Equipe
 * leem daqui.
 */

import { crmRoleLocked, effectiveCrmRole, type CrmRole } from './crm-roles';
import type { Role } from './permissions';

/** Negado · Se responsável (os seus e os sem responsável) · Permitido (todos). */
export type Level = 'none' | 'own' | 'all';

export interface CrmRights {
  leads: { create: Level; view: Level; edit: Level; delete: Level; export: Level };
  tasks: { edit: Level };
  /** Configura o CRM: funis, robôs, modelos, WhatsApp, equipe, distribuição. */
  config: boolean;
}

export const LEVEL_LABEL: Record<Level, string> = { none: 'Negado', own: 'Se responsável', all: 'Permitido' };

/** Que alcances cada célula do quadro aceita (criar e exportar não têm "se responsável"; ver não tem "negado"). */
export const RIGHT_CELLS: { entity: 'leads' | 'tasks'; label: string; actions: { key: string; label: string; levels: Level[] }[] }[] = [
  {
    entity: 'leads',
    label: 'Negócios e conversas',
    actions: [
      { key: 'create', label: 'Criar', levels: ['none', 'all'] },
      { key: 'view', label: 'Ver', levels: ['own', 'all'] },
      { key: 'edit', label: 'Editar', levels: ['none', 'own', 'all'] },
      { key: 'delete', label: 'Excluir', levels: ['none', 'own', 'all'] },
      { key: 'export', label: 'Exportar', levels: ['none', 'all'] },
    ],
  },
  { entity: 'tasks', label: 'Tarefas', actions: [{ key: 'edit', label: 'Editar', levels: ['none', 'own', 'all'] }] },
];

export const ROLE_RIGHTS: Record<CrmRole, CrmRights> = {
  MANAGER: {
    leads: { create: 'all', view: 'all', edit: 'all', delete: 'all', export: 'all' },
    tasks: { edit: 'all' },
    config: true,
  },
  AGENT: {
    leads: { create: 'all', view: 'all', edit: 'all', delete: 'none', export: 'none' },
    tasks: { edit: 'all' },
    config: false,
  },
  AGENT_OWN: {
    leads: { create: 'all', view: 'own', edit: 'own', delete: 'none', export: 'none' },
    tasks: { edit: 'own' },
    config: false,
  },
};

const RANK: Record<Level, number> = { none: 0, own: 1, all: 2 };

function level(v: unknown, allowed: Level[], fallback: Level): Level {
  return typeof v === 'string' && (allowed as string[]).includes(v) ? (v as Level) : fallback;
}

/**
 * Lê permissões gravadas (JSON), corrigindo o que vier torto: valor que a
 * célula não aceita volta ao do cargo, e editar nunca passa de ver (quem não
 * enxerga um negócio não tem como mexer nele).
 */
export function readRights(raw: unknown, base: CrmRights): CrmRights {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, Record<string, unknown> | unknown>) : {};
  const l = (o.leads && typeof o.leads === 'object' ? o.leads : {}) as Record<string, unknown>;
  const t = (o.tasks && typeof o.tasks === 'object' ? o.tasks : {}) as Record<string, unknown>;
  const view = level(l.view, ['own', 'all'], base.leads.view);
  const teto = (x: Level): Level => (RANK[x] > RANK[view] ? view : x);
  return {
    leads: {
      create: level(l.create, ['none', 'all'], base.leads.create),
      view,
      edit: teto(level(l.edit, ['none', 'own', 'all'], base.leads.edit)),
      delete: teto(level(l.delete, ['none', 'own', 'all'], base.leads.delete)),
      export: level(l.export, ['none', 'all'], base.leads.export),
    },
    tasks: { edit: teto(level(t.edit, ['none', 'own', 'all'], base.tasks.edit)) },
    config: typeof o.config === 'boolean' ? o.config : base.config,
  };
}

/** As permissões que valem: o dono tem tudo; senão, as gravadas ou as do cargo. */
export function effectiveRights(role: Role | string | null | undefined, crmRole: string | null | undefined, custom: unknown): CrmRights {
  const cargo = effectiveCrmRole(role, crmRole);
  if (crmRoleLocked(role)) return ROLE_RIGHTS.MANAGER;
  const base = ROLE_RIGHTS[cargo];
  return custom ? readRights(custom, base) : base;
}

export const sameRights = (a: CrmRights, b: CrmRights) => JSON.stringify(a) === JSON.stringify(b);

/** O cargo que estas permissões formam, ou null se não batem com nenhum (Personalizado). */
export function presetOf(r: CrmRights): CrmRole | null {
  return (Object.keys(ROLE_RIGHTS) as CrmRole[]).find((k) => sameRights(ROLE_RIGHTS[k], r)) ?? null;
}

/** O alcance permite mexer num item com este responsável? */
export function levelAllows(lv: Level, viewerId: string, assignedToId: string | null | undefined): boolean {
  if (lv === 'all') return true;
  if (lv === 'none') return false;
  return !assignedToId || assignedToId === viewerId;
}
