/**
 * Quanto a clínica paga pelo CRM. Puro: recebe o estado e devolve números,
 * para as regras de cobrança serem testadas sem banco nem Asaas.
 *
 * O CRM é um adicional por cima de qualquer plano: plano + preço por usuário
 * com acesso. 14 dias grátis uma vez; cortesia inclui o CRM.
 * Spec: docs/superpowers/specs/2026-10-09-crm-adicional-pago-design.md
 */

export const CRM_TRIAL_DAYS = 14;
/** Dias antes do fim do teste em que o aviso aparece. */
export const CRM_TRIAL_WARNING_DAYS = 3;

export type CrmStatus = 'off' | 'trial' | 'paid' | 'complimentary';

export interface CrmSubscriptionState {
  crmEnabled: boolean;
  crmTrialEndsAt: Date | null;
  complimentary: boolean;
}

export function crmStatus(sub: CrmSubscriptionState | null, now: Date = new Date()): CrmStatus {
  // Cortesia inclui o CRM, ligado ou não.
  if (sub?.complimentary) return 'complimentary';
  if (!sub?.crmEnabled) return 'off';
  if (sub.crmTrialEndsAt && sub.crmTrialEndsAt.getTime() > now.getTime()) return 'trial';
  return 'paid';
}

/** O teste só existe uma vez por clínica. */
export const trialAvailable = (sub: Pick<CrmSubscriptionState, 'crmTrialEndsAt'> | null) => !sub?.crmTrialEndsAt;

/** Perfis que podem ter acesso ao CRM (e, portanto, contar na cobrança). */
export const CRM_ELIGIBLE_ROLES = ['OWNER', 'ADMIN', 'RECEPTIONIST'] as const;

export interface SeatUser {
  active: boolean;
  crmSeat: boolean;
  role: string;
}

/** Quem conta na cobrança: ativo, com a chave ligada e perfil elegível. */
export function seatsCharged(users: readonly SeatUser[]): number {
  return users.filter(
    (u) => u.active && u.crmSeat && (CRM_ELIGIBLE_ROLES as readonly string[]).includes(u.role),
  ).length;
}

export interface BillingInput {
  planPriceCents: number;
  seatPriceCents: number;
  seats: number;
  status: CrmStatus;
}

/** A parte do CRM na mensalidade: só cobra depois do teste e fora da cortesia. */
export function crmChargeCents({ seatPriceCents, seats, status }: Omit<BillingInput, 'planPriceCents'>): number {
  return status === 'paid' ? Math.max(0, seats) * seatPriceCents : 0;
}

export function subscriptionValueCents(input: BillingInput): number {
  return input.planPriceCents + crmChargeCents(input);
}

/** O texto que aparece na fatura do Asaas. */
export function subscriptionDescription(planName: string, status: CrmStatus, seats: number): string {
  if (status !== 'paid' || seats <= 0) return `ClinicaIQ — plano ${planName}`;
  return `ClinicaIQ — plano ${planName} + CRM (${seats} ${seats === 1 ? 'usuário' : 'usuários'})`;
}

/** Dias que faltam no teste (arredondado para cima), ou null fora do teste. */
export function trialDaysLeft(sub: CrmSubscriptionState | null, now: Date = new Date()): number | null {
  if (crmStatus(sub, now) !== 'trial' || !sub?.crmTrialEndsAt) return null;
  return Math.ceil((sub.crmTrialEndsAt.getTime() - now.getTime()) / 86_400_000);
}
