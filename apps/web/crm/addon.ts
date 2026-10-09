import { prisma } from '@clinicaiq/db';
import {
  CRM_ELIGIBLE_ROLES,
  CRM_TRIAL_DAYS,
  crmStatus,
  seatsCharged,
  subscriptionDescription,
  subscriptionValueCents,
  trialAvailable,
} from './billing';

/**
 * O CRM como adicional pago: ligar (com teste de 14 dias na primeira vez),
 * desligar, dar e tirar acesso por pessoa, e manter o valor da assinatura no
 * Asaas igual ao que as regras de `billing.ts` dizem.
 *
 * Quem chama já conferiu o perfil (`planos` para ligar/desligar, `equipe` para
 * acesso) e que a clínica pode gravar.
 */

type Result = { ok: true } | { ok: false; message: string };

/** O que `syncBillingValue` precisa do Asaas — injetável para teste. */
export interface BillingGateway {
  configured: () => boolean;
  updateValue: (subscriptionId: string, priceCents: number, planName: string, description: string) => Promise<void>;
}

async function defaultGateway(): Promise<BillingGateway> {
  const asaas = await import('@/lib/asaas');
  return { configured: asaas.isConfigured, updateValue: asaas.updateSubscriptionValue };
}

export type SyncResult =
  | { sent: true; valueCents: number }
  | { sent: false; reason: 'no-subscription' | 'no-asaas' | 'complimentary' | 'unchanged' | 'not-configured' };

/**
 * Calcula o valor da mensalidade (plano + CRM) e, se mudou desde o último
 * envio, atualiza a assinatura no Asaas. Idempotente: a rotina diária pode
 * chamar sempre.
 */
export async function syncBillingValue(
  tenantId: string,
  gateway?: BillingGateway,
  now: Date = new Date(),
): Promise<SyncResult> {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: {
      id: true,
      crmEnabled: true,
      crmTrialEndsAt: true,
      complimentary: true,
      asaasSubscriptionId: true,
      billedValueCents: true,
      plan: { select: { name: true, monthlyPriceCents: true, crmSeatPriceCents: true } },
    },
  });
  if (!sub) return { sent: false, reason: 'no-subscription' };
  // Cortesia não é cobrada; a rotina de cortesia já encerra a cobrança no Asaas.
  if (sub.complimentary) return { sent: false, reason: 'complimentary' };
  if (!sub.asaasSubscriptionId) return { sent: false, reason: 'no-asaas' };

  const users = await prisma.user.findMany({ where: { tenantId }, select: { active: true, crmSeat: true, role: true } });
  const status = crmStatus(sub, now);
  const seats = seatsCharged(users);
  const valueCents = subscriptionValueCents({
    planPriceCents: sub.plan.monthlyPriceCents,
    seatPriceCents: sub.plan.crmSeatPriceCents,
    seats,
    status,
  });
  if (sub.billedValueCents === valueCents) return { sent: false, reason: 'unchanged' };

  const gw = gateway ?? (await defaultGateway());
  if (!gw.configured()) return { sent: false, reason: 'not-configured' };

  await gw.updateValue(sub.asaasSubscriptionId, valueCents, sub.plan.name, subscriptionDescription(sub.plan.name, status, seats));
  await prisma.subscription.update({ where: { id: sub.id }, data: { billedValueCents: valueCents } });
  return { sent: true, valueCents };
}

/**
 * Valor e descrição da mensalidade (plano + CRM) para um plano — o atual, ou
 * outro que a clínica está escolhendo. Usado pela troca de plano.
 */
export async function billingFor(
  tenantId: string,
  plan: { name: string; monthlyPriceCents: number; crmSeatPriceCents: number },
  now: Date = new Date(),
): Promise<{ valueCents: number; description: string }> {
  const [sub, users] = await Promise.all([
    prisma.subscription.findUnique({
      where: { tenantId },
      select: { crmEnabled: true, crmTrialEndsAt: true, complimentary: true },
    }),
    prisma.user.findMany({ where: { tenantId }, select: { active: true, crmSeat: true, role: true } }),
  ]);
  const status = crmStatus(sub, now);
  const seats = seatsCharged(users);
  return {
    valueCents: subscriptionValueCents({
      planPriceCents: plan.monthlyPriceCents,
      seatPriceCents: plan.crmSeatPriceCents,
      seats,
      status,
    }),
    description: subscriptionDescription(plan.name, status, seats),
  };
}

const isEligible = (role: string) => (CRM_ELIGIBLE_ROLES as readonly string[]).includes(role);

/**
 * Liga o CRM. Na primeira vez (fora da cortesia), começa o teste de 14 dias;
 * depois disso, liga já cobrando. Quem ligou ganha acesso.
 */
export async function turnOnCrm(
  tenantId: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ ok: true; mode: 'trial' | 'paid' | 'complimentary' } | { ok: false; message: string }> {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { id: true, crmEnabled: true, crmTrialEndsAt: true, complimentary: true },
  });
  if (!sub) return { ok: false, message: 'A clínica ainda não tem um plano. Escolha um plano primeiro.' };

  const comTeste = !sub.complimentary && trialAvailable(sub);
  const quem = await prisma.user.findFirst({ where: { id: userId, tenantId, active: true }, select: { role: true } });

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        crmEnabled: true,
        ...(comTeste ? { crmTrialEndsAt: new Date(now.getTime() + CRM_TRIAL_DAYS * 86_400_000) } : {}),
      },
    }),
    ...(quem && isEligible(quem.role)
      ? [prisma.user.updateMany({ where: { id: userId, tenantId }, data: { crmSeat: true } })]
      : []),
    prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: comTeste ? 'CRM_TRIAL_STARTED' : 'CRM_ENABLED',
        entity: 'Subscription',
        entityId: sub.id,
      },
    }),
  ]);
  return { ok: true, mode: sub.complimentary ? 'complimentary' : comTeste ? 'trial' : 'paid' };
}

/** Desliga o CRM: sai da cobrança, os dados ficam guardados para religar. */
export async function turnOffCrm(tenantId: string, userId: string): Promise<Result> {
  const sub = await prisma.subscription.findUnique({ where: { tenantId }, select: { id: true, crmEnabled: true } });
  if (!sub) return { ok: false, message: 'Assinatura não encontrada.' };
  if (!sub.crmEnabled) return { ok: true };
  await prisma.$transaction([
    prisma.subscription.update({ where: { id: sub.id }, data: { crmEnabled: false } }),
    prisma.auditLog.create({ data: { tenantId, userId, action: 'CRM_DISABLED', entity: 'Subscription', entityId: sub.id } }),
  ]);
  return { ok: true };
}

/**
 * Dá ou tira o acesso ao CRM de uma pessoa da equipe. Enquanto o CRM estiver
 * ligado, sobra pelo menos uma pessoa com acesso — senão ninguém consegue nem
 * desligar pelo CRM, e a clínica paga por um CRM que ninguém abre.
 */
export async function setCrmSeat(tenantId: string, actorId: string, targetUserId: string, on: boolean): Promise<Result> {
  const alvo = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId, active: true },
    select: { id: true, role: true, crmSeat: true, name: true },
  });
  if (!alvo) return { ok: false, message: 'Pessoa não encontrada na equipe.' };
  if (on && !isEligible(alvo.role)) {
    return { ok: false, message: 'O perfil Profissional não tem acesso ao CRM. Troque o perfil para Recepção ou Administrador.' };
  }
  if (alvo.crmSeat === on) return { ok: true };

  if (!on) {
    const sub = await prisma.subscription.findUnique({ where: { tenantId }, select: { crmEnabled: true } });
    const outros = await prisma.user.count({
      where: { tenantId, active: true, crmSeat: true, id: { not: targetUserId }, role: { in: [...CRM_ELIGIBLE_ROLES] } },
    });
    if (sub?.crmEnabled && outros === 0) {
      return { ok: false, message: 'Pelo menos uma pessoa precisa ter acesso ao CRM. Para parar de pagar, desligue o CRM no Plano.' };
    }
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: alvo.id }, data: { crmSeat: on } }),
    prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action: on ? 'CRM_SEAT_GRANTED' : 'CRM_SEAT_REVOKED',
        entity: 'User',
        entityId: alvo.id,
      },
    }),
  ]);
  return { ok: true };
}

/** Situação do CRM para as telas de Plano e Equipe. */
export async function loadCrmAddon(tenantId: string, now: Date = new Date()) {
  const [sub, users] = await Promise.all([
    prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        crmEnabled: true,
        crmTrialEndsAt: true,
        complimentary: true,
        plan: { select: { name: true, monthlyPriceCents: true, crmSeatPriceCents: true } },
      },
    }),
    prisma.user.findMany({ where: { tenantId }, select: { active: true, crmSeat: true, role: true } }),
  ]);
  const status = crmStatus(sub, now);
  const seats = seatsCharged(users);
  const seatPriceCents = sub?.plan.crmSeatPriceCents ?? 3900;
  return {
    status,
    seats,
    seatPriceCents,
    trialAvailable: !sub?.complimentary && trialAvailable(sub),
    trialEndsAt: sub?.crmTrialEndsAt?.toISOString() ?? null,
    planName: sub?.plan.name ?? null,
    planPriceCents: sub?.plan.monthlyPriceCents ?? 0,
    /** O que a parte do CRM custará (ou custa) por mês com as pessoas de hoje. */
    crmMonthlyCents: seats * seatPriceCents,
  };
}
