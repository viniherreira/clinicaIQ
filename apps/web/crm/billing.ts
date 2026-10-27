/**
 * Quanto a clínica paga pelo CRM. Puro: recebe o estado e devolve números,
 * para as regras de cobrança serem testadas sem banco nem Asaas.
 *
 * O CRM é um adicional por cima de qualquer plano: o plano "com CRM" soma um
 * pacote que já inclui alguns usuários, e cada usuário a mais paga à parte.
 * 14 dias grátis uma vez; cortesia inclui o CRM.
 * Spec: docs/specs/2026-10-09-crm-adicional-pago-design.md
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

/** O preço do CRM num plano: o pacote, quantos usuários ele inclui e o preço do usuário a mais. */
export interface CrmPrice {
  packagePriceCents: number;
  includedSeats: number;
  seatPriceCents: number;
}

export interface BillingInput extends CrmPrice {
  planPriceCents: number;
  seats: number;
  status: CrmStatus;
  /**
   * Produto só CRM, sem a agenda: não há plano da agenda, o CRM custa este
   * valor em vez do pacote e conta até no teste do CRM — os 14 dias grátis do
   * CRM são para quem acrescenta o CRM à agenda.
   */
  crmOnlyPriceCents?: number;
}

/** O CRM com estas pessoas, pago: pacote + quem passar do incluído. */
export function crmPriceCents({ packagePriceCents, includedSeats, seatPriceCents }: CrmPrice, seats: number): number {
  return packagePriceCents + Math.max(0, seats - includedSeats) * seatPriceCents;
}

/** A parte do CRM na mensalidade: só cobra depois do teste e fora da cortesia. */
export function crmChargeCents({ seats, status, ...preco }: Omit<BillingInput, 'planPriceCents'>): number {
  return status === 'paid' ? crmPriceCents(preco, seats) : 0;
}

/** O preço do CRM de um plano, como o banco guarda. */
export const crmPriceOf = (plan: { crmPackagePriceCents: number; crmIncludedSeats: number; crmSeatPriceCents: number }): CrmPrice => ({
  packagePriceCents: plan.crmPackagePriceCents,
  includedSeats: plan.crmIncludedSeats,
  seatPriceCents: plan.crmSeatPriceCents,
});

export function subscriptionValueCents(input: BillingInput): number {
  if (input.crmOnlyPriceCents !== undefined) {
    if (input.status === 'complimentary') return 0;
    return crmPriceCents({ ...input, packagePriceCents: input.crmOnlyPriceCents }, input.seats);
  }
  return input.planPriceCents + crmChargeCents(input);
}

/** O texto que aparece na fatura do Asaas. */
export function subscriptionDescription(planName: string, status: CrmStatus, seats: number, crmOnly = false): string {
  if (crmOnly) return `DreamClin: CRM ${planName} (${seats} ${seats === 1 ? 'usuário' : 'usuários'})`;
  if (status !== 'paid' || seats <= 0) return `DreamClin: plano ${planName}`;
  return `DreamClin: plano ${planName} + CRM (${seats} ${seats === 1 ? 'usuário' : 'usuários'})`;
}

/** Dias que faltam no teste (arredondado para cima), ou null fora do teste. */
export function trialDaysLeft(sub: CrmSubscriptionState | null, now: Date = new Date()): number | null {
  if (crmStatus(sub, now) !== 'trial' || !sub?.crmTrialEndsAt) return null;
  return Math.ceil((sub.crmTrialEndsAt.getTime() - now.getTime()) / 86_400_000);
}
