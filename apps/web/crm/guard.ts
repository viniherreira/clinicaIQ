import 'server-only';

import { getTenantClient, prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { currentAccess } from '@/lib/guard';
import { getTenantModules, writeBlocked } from '@/lib/access';
import { can, capabilityDeniedMessage, type Role } from '@/lib/permissions';
import { effectiveCrmRole, type CrmRole } from '@/lib/crm-roles';
import { effectiveRights, type CrmRights } from '@/lib/crm-rights';
import { nudgeTick } from './tick-nudge';

/**
 * A porta do CRM. São três trancas, e todas precisam abrir:
 *
 * 1. a clínica ligou o CRM (`Subscription.crmEnabled` — em teste, pago ou cortesia);
 * 2. o papel da pessoa alcança o CRM (`crm`) e, para configurar, o cargo dela
 *    no CRM é Gestor (`lib/crm-roles.ts` — o `crm_config` de antes);
 * 3. a pessoa tem acesso ao CRM (`User.crmSeat`) — é por pessoa que o CRM é cobrado.
 *    Na cortesia não há cobrança por pessoa: toda a equipe com o perfil entra.
 *
 * Esconder o menu não protege nada — quem digita /crm cai aqui, no servidor.
 */

export type CrmCapability = 'crm' | 'crm_config';

export interface CrmContext {
  tenantId: string;
  userId: string;
  role: Role;
  /** Cargo no CRM (Gestor, Atendente, Atendente só dos dele). */
  crmRole: CrmRole;
  /** O que pode em cada coisa do CRM (quadro de permissões, como no Kommo). */
  rights: CrmRights;
  /** Configura o CRM (`rights.config`). */
  manager: boolean;
  /** Vê só os negócios e conversas dele, e os sem responsável (`rights.leads.view`). */
  ownOnly: boolean;
  db: TenantPrismaClient;
}

/** Para onde vai quem não pode entrar no CRM (módulo desligado ou sem acesso pessoal). */
export const CRM_NOT_CONTRACTED_PATH = '/crm-indisponivel';

export const CRM_NO_SEAT_MESSAGE = 'Você não tem acesso ao CRM. Peça ao responsável da clínica para liberar na Equipe.';

/** A chave de acesso e o cargo no CRM da pessoa. */
async function crmUser(userId: string): Promise<{ crmSeat: boolean; crmRole: string | null; crmRights: unknown } | null> {
  return prisma.user
    .findUnique({ where: { id: userId }, select: { crmSeat: true, crmRole: true, crmRights: true } })
    .catch(() => null);
}

/** A pessoa tem a chave de acesso ao CRM ligada? */
export async function hasCrmSeat(userId: string): Promise<boolean> {
  return Boolean((await crmUser(userId))?.crmSeat);
}

/** O que a guarda junta ao acesso: cargo e permissões. */
function crmFlags(role: Role, stored: string | null | undefined, custom?: unknown) {
  const crmRole = effectiveCrmRole(role, stored);
  const rights = effectiveRights(role, stored, custom);
  return { crmRole, rights, manager: rights.config, ownOnly: rights.leads.view === 'own' };
}

/** A capacidade pedida, pelo cargo no CRM. */
const allows = (role: Role, flags: { manager: boolean }, capability: CrmCapability) =>
  can(role, 'crm') && (capability === 'crm' || flags.manager);

export const CRM_NOT_CONTRACTED_MESSAGE =
  'O CRM não está ativo no plano da clínica. Fale com o responsável pela clínica.';

/** Guarda das páginas: redireciona para uma tela que explica. */
export async function requireCrm(capability: CrmCapability): Promise<CrmContext> {
  const acesso = await currentAccess();
  if (!acesso) redirect('/sign-in');

  const modules = await getTenantModules(acesso.tenantId);
  if (!modules.crm) redirect(CRM_NOT_CONTRACTED_PATH);
  const eu = await crmUser(acesso.userId);
  const flags = crmFlags(acesso.role, eu?.crmRole, eu?.crmRights);
  if (!allows(acesso.role, flags, capability)) redirect(`/sem-acesso?modulo=${capability}`);
  if (!modules.crmWholeTeam && !eu?.crmSeat) redirect(CRM_NOT_CONTRACTED_PATH);

  nudgeTick();
  return { ...acesso, ...flags, db: getTenantClient(acesso.tenantId) };
}

export type CrmActionGuard =
  | ({ ok: true } & CrmContext)
  | { ok: false; message: string };

/**
 * Guarda das Server Actions. Devolve a mensagem em vez de redirecionar, como
 * `writeBlocked`/`capabilityBlocked`: cada action responde no formato que a
 * tela dela já espera.
 *
 * Inclui a trava de escrita da cobrança — action não passa pelo layout, então
 * o aviso de clínica suspensa sozinho não impede gravar.
 */
export async function guardCrmAction(
  capability: CrmCapability,
  { write = true }: { write?: boolean } = {},
): Promise<CrmActionGuard> {
  const acesso = await currentAccess();
  if (!acesso) return { ok: false, message: 'Sua sessão expirou. Entre de novo.' };

  const modules = await getTenantModules(acesso.tenantId);
  if (!modules.crm) return { ok: false, message: CRM_NOT_CONTRACTED_MESSAGE };
  const eu = await crmUser(acesso.userId);
  const flags = crmFlags(acesso.role, eu?.crmRole, eu?.crmRights);
  if (!allows(acesso.role, flags, capability)) return { ok: false, message: capabilityDeniedMessage(capability) };
  if (!modules.crmWholeTeam && !eu?.crmSeat) return { ok: false, message: CRM_NO_SEAT_MESSAGE };

  // Ler continua aberto para clínica suspensa — os dados são dos pacientes.
  if (write) {
    const bloqueio = await writeBlocked(acesso.tenantId);
    if (bloqueio) return { ok: false, message: bloqueio };
  }

  return { ok: true, ...acesso, ...flags, db: getTenantClient(acesso.tenantId) };
}
