import 'server-only';

import { getTenantClient, prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { currentAccess } from '@/lib/guard';
import { getTenantModules, writeBlocked } from '@/lib/access';
import { can, capabilityDeniedMessage, type Role } from '@/lib/permissions';

/**
 * A porta do CRM. São três trancas, e todas precisam abrir:
 *
 * 1. a clínica ligou o CRM (`Subscription.crmEnabled` — em teste, pago ou cortesia);
 * 2. o papel da pessoa alcança a capacidade (`crm` ou `crm_config`);
 * 3. a pessoa tem acesso ao CRM (`User.crmSeat`) — é por pessoa que o CRM é cobrado.
 *
 * Esconder o menu não protege nada — quem digita /crm cai aqui, no servidor.
 */

export type CrmCapability = 'crm' | 'crm_config';

export interface CrmContext {
  tenantId: string;
  userId: string;
  role: Role;
  db: TenantPrismaClient;
}

/** Para onde vai quem não pode entrar no CRM (módulo desligado ou sem acesso pessoal). */
export const CRM_NOT_CONTRACTED_PATH = '/crm-indisponivel';

export const CRM_NO_SEAT_MESSAGE = 'Você não tem acesso ao CRM. Peça ao responsável da clínica para liberar na Equipe.';

/** A pessoa tem a chave de acesso ao CRM ligada? */
export async function hasCrmSeat(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { crmSeat: true } }).catch(() => null);
  return Boolean(u?.crmSeat);
}

export const CRM_NOT_CONTRACTED_MESSAGE =
  'O CRM não está ativo no plano da clínica. Fale com o responsável pela clínica.';

/** Guarda das páginas: redireciona para uma tela que explica. */
export async function requireCrm(capability: CrmCapability): Promise<CrmContext> {
  const acesso = await currentAccess();
  if (!acesso) redirect('/sign-in');

  const modules = await getTenantModules(acesso.tenantId);
  if (!modules.crm) redirect(CRM_NOT_CONTRACTED_PATH);
  if (!can(acesso.role, capability)) redirect(`/sem-acesso?modulo=${capability}`);
  if (!(await hasCrmSeat(acesso.userId))) redirect(CRM_NOT_CONTRACTED_PATH);

  return { ...acesso, db: getTenantClient(acesso.tenantId) };
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
  if (!can(acesso.role, capability)) return { ok: false, message: capabilityDeniedMessage(capability) };
  if (!(await hasCrmSeat(acesso.userId))) return { ok: false, message: CRM_NO_SEAT_MESSAGE };

  // Ler continua aberto para clínica suspensa — os dados são dos pacientes.
  if (write) {
    const bloqueio = await writeBlocked(acesso.tenantId);
    if (bloqueio) return { ok: false, message: bloqueio };
  }

  return { ok: true, ...acesso, db: getTenantClient(acesso.tenantId) };
}
