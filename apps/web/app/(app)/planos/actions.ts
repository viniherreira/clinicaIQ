'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@clinicaiq/db';
import {
  cancelSubscription,
  createSubscription,
  ensureCustomer,
  getPixCode,
  isConfigured,
  isSandbox,
  listPayments,
  toChargeStatus,
  updateSubscriptionValue,
  MIN_CHARGE_CENTS,
  type BillingMethod,
} from '@/lib/asaas';
import { NO_SUBSCRIPTION, resolveAccess, type Access } from '@/lib/subscription';
import { documentError, formatDocument, isValidDocument } from '@/lib/document';
import { capabilityBlocked, currentRole } from '@/lib/access';
import { stopComplimentaryBilling } from '@/lib/complimentary';
import { billingFor } from '@/crm/addon';
import { CRM_ELIGIBLE_ROLES } from '@/crm/billing';
import { modulesOf, parseProduct, productAvailable, productOf, PRODUCT_INFO, type Product } from '@/lib/products';

const EM_CORTESIA = 'Sua clínica está em cortesia: acesso completo, sem cobrança. Não há plano a contratar ou cancelar.';

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, active: true },
    select: { id: true, tenantId: true },
  });
  if (!user) redirect('/onboarding');

  return { tenantId: user.tenantId, userId: user.id };
}

/**
 * Liga os módulos do produto escolhido. Com o CRM, quem escolheu ganha acesso a
 * ele se ninguém tiver — senão a clínica pagaria por um CRM que ninguém abre.
 * Sem o CRM, os leads ficam guardados para quando religar.
 */
async function applyProduct(tenantId: string, userId: string, product: Product) {
  const m = modulesOf(product);
  const sub = await prisma.subscription.findUnique({ where: { tenantId }, select: { id: true, clinicEnabled: true, crmEnabled: true } });
  if (!sub) return;
  if (sub.clinicEnabled === m.clinicEnabled && sub.crmEnabled === m.crmEnabled) return;
  const role = await currentRole(tenantId);
  const semNinguem =
    m.crmEnabled && (await prisma.user.count({ where: { tenantId, active: true, crmSeat: true } })) === 0;
  await prisma.$transaction([
    prisma.subscription.update({ where: { id: sub.id }, data: m }),
    ...(semNinguem && (CRM_ELIGIBLE_ROLES as readonly string[]).includes(role)
      ? [prisma.user.updateMany({ where: { id: userId, tenantId }, data: { crmSeat: true } })]
      : []),
    prisma.auditLog.create({
      data: { tenantId, userId, action: `PRODUCT_CHANGED_${product}`, entity: 'Subscription', entityId: sub.id },
    }),
  ]);
}

function refreshPlan() {
  revalidatePath('/configuracoes');
  revalidatePath('/crm', 'layout');
  revalidatePath('/dashboard');
}

export interface PlanOption {
  tier: 'ESSENCIAL' | 'PROFISSIONAL' | 'CLINICA';
  name: string;
  description: string;
  monthlyPriceCents: number;
  maxProfessionals: number | null;
  whatsappEnabled: boolean;
  campaignsEnabled: boolean;
  advancedReports: boolean;
  /** O plano com CRM: quanto o CRM soma, quantos usuários inclui e o preço de cada um a mais. */
  crmPackagePriceCents: number;
  crmIncludedSeats: number;
  crmSeatPriceCents: number;
  /** O CRM sozinho, sem a agenda. */
  crmOnlyPriceCents: number;
  /** O tamanho atual da clínica (o produto atual está em `BillingData.product`). */
  current: boolean;
}

export interface ChargeRow {
  id: string;
  amountCents: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  pixPayload: string | null;
}

export interface BillingData {
  plans: PlanOption[];
  access: Access;
  currentTier: string | null;
  /** Até quando a assinatura está paga. Nulo quando não há assinatura. */
  currentPeriodEnd: string | null;
  /** True quando o Asaas cobra sozinho todo mês, sem a clínica fazer nada. */
  renewsAutomatically: boolean;
  professionalsInUse: number;
  charges: ChargeRow[];
  /** True while pointing at the Asaas sandbox — shown so nobody mistakes a test charge for real. */
  sandbox: boolean;
  gatewayReady: boolean;
  /** CPF or CNPJ on file, already formatted. Empty when the clinic never set one. */
  document: string;
  clinicName: string;
  /** O produto contratado (ou em teste): Agenda, CRM ou Completo. */
  product: Product;
  /** Em teste grátis e ainda sem assinar: escolher um plano pode só trocar o do teste. */
  trialOpen: boolean;
  /** Fim do teste grátis, quando houver. */
  trialEndsAt: string | null;
}

/**
 * Records the clinic's CPF or CNPJ. Lives here, next to the plans, because that
 * is where the clinic discovers it is needed — sending it to Settings to fill a
 * field and come back loses people who were ready to pay.
 */
export async function saveDocument(value: string): Promise<{ ok: boolean; error?: string }> {
  const { tenantId } = await requireTenant();

  const semAcesso = await capabilityBlocked(tenantId, 'planos');
  if (semAcesso) return { ok: false, error: semAcesso };

  const problem = documentError(value);
  if (problem) return { ok: false, error: problem };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { document: formatDocument(value) },
  });
  revalidatePath('/configuracoes');
  return { ok: true };
}

export async function getBillingData(): Promise<BillingData> {
  const { tenantId } = await requireTenant();

  const [plans, subscription, professionalsInUse, tenant] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.subscription.findUnique({ where: { tenantId } }),
    prisma.professional.count({ where: { tenantId, active: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, document: true } }),
  ]);

  const access = subscription
    ? resolveAccess(
        {
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
          graceEndsAt: subscription.graceEndsAt,
          cancelledAt: subscription.cancelledAt,
          complimentary: subscription.complimentary,
          billingLinked: Boolean(subscription.asaasSubscriptionId),
        },
        new Date(),
      )
    : NO_SUBSCRIPTION;

  if (subscription?.complimentary) {
    // Quem abre a tela de plano de uma clínica em cortesia é o momento certo de
    // garantir que o Asaas parou de cobrar — sem esperar a reconciliação diária.
    await stopComplimentaryBilling(subscription).catch((e) =>
      console.error('[cortesia] falha ao encerrar cobrança', tenantId, e),
    );
  } else if (subscription?.asaasSubscriptionId && isConfigured()) {
    // Pull fresh charges from Asaas when linked, so a payment made minutes ago
    // is visible even if the webhook has not landed yet.
    await syncCharges(tenantId, subscription.id, subscription.asaasSubscriptionId);
  }

  const charges = await prisma.charge.findMany({
    where: { tenantId },
    orderBy: { dueDate: 'desc' },
    take: 12,
  });

  return {
    plans: plans.map((p) => ({
      tier: p.tier,
      name: p.name,
      description: p.description,
      monthlyPriceCents: p.monthlyPriceCents,
      maxProfessionals: p.maxProfessionals,
      whatsappEnabled: p.whatsappEnabled,
      campaignsEnabled: p.campaignsEnabled,
      advancedReports: p.advancedReports,
      crmPackagePriceCents: p.crmPackagePriceCents,
      crmIncludedSeats: p.crmIncludedSeats,
      crmSeatPriceCents: p.crmSeatPriceCents,
      crmOnlyPriceCents: p.crmOnlyPriceCents,
      current: subscription?.tier === p.tier,
    })),
    product: productOf({ clinicEnabled: subscription?.clinicEnabled ?? true, crmEnabled: Boolean(subscription?.crmEnabled) }),
    trialOpen: access.status === 'TRIALING' && !subscription?.asaasSubscriptionId,
    trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
    access,
    currentTier: subscription?.tier ?? null,
    // A data que a clínica procura primeiro quando abre esta tela: até quando
    // está paga. Sem ela, a única pista era um aviso que só aparecia perto do
    // vencimento — ou seja, tarde.
    currentPeriodEnd: subscription?.currentPeriodEnd.toISOString() ?? null,
    renewsAutomatically: Boolean(subscription?.asaasSubscriptionId),
    professionalsInUse,
    charges: charges.map((c) => ({
      id: c.id,
      amountCents: c.amountCents,
      status: c.status,
      dueDate: c.dueDate.toISOString(),
      paidAt: c.paidAt?.toISOString() ?? null,
      invoiceUrl: c.invoiceUrl,
      bankSlipUrl: c.bankSlipUrl,
      pixPayload: c.pixPayload,
    })),
    sandbox: isSandbox(),
    gatewayReady: isConfigured(),
    document: tenant?.document && isValidDocument(tenant.document) ? formatDocument(tenant.document) : '',
    clinicName: tenant?.name ?? '',
  };
}

/** Mirrors Asaas charges into our table so the screen works even if Asaas is down. */
async function syncCharges(
  tenantId: string,
  subscriptionId: string,
  asaasSubscriptionId: string,
): Promise<void> {
  try {
    const payments = await listPayments(asaasSubscriptionId);
    for (const p of payments) {
      const status = toChargeStatus(p.status);
      // Only fetch the PIX code for something still payable — it is an extra
      // round-trip per charge, and a paid invoice has no use for it.
      const pixPayload = status === 'PENDING' || status === 'OVERDUE' ? await getPixCode(p.id) : null;

      await prisma.charge.upsert({
        where: { asaasChargeId: p.id },
        create: {
          tenantId,
          subscriptionId,
          asaasChargeId: p.id,
          amountCents: Math.round(p.value * 100),
          status,
          dueDate: new Date(p.dueDate),
          paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
          invoiceUrl: p.invoiceUrl ?? null,
          bankSlipUrl: p.bankSlipUrl ?? null,
          pixPayload,
        },
        update: {
          status,
          paidAt: p.paymentDate ? new Date(p.paymentDate) : null,
          invoiceUrl: p.invoiceUrl ?? null,
          bankSlipUrl: p.bankSlipUrl ?? null,
          ...(pixPayload ? { pixPayload } : {}),
        },
      });
    }
  } catch {
    // Asaas unreachable: fall back to what we already stored rather than
    // failing the whole screen. The clinic still sees its last known invoice.
  }
}

export interface ChoosePlanResult {
  ok: boolean;
  error?: string;
  invoiceUrl?: string;
  /** Tells the screen to ask for the CPF/CNPJ instead of just showing an error. */
  needsDocument?: boolean;
}

/**
 * Assina (ou troca) o plano: o tamanho (`tier`) e o produto. Na troca, o valor
 * novo vale da próxima fatura em diante e os módulos mudam na hora.
 */
export async function choosePlan(
  tier: string,
  method: BillingMethod = 'PIX',
  productInput?: string,
): Promise<ChoosePlanResult> {
  const { tenantId, userId } = await requireTenant();

  const semAcesso = await capabilityBlocked(tenantId, 'planos');
  if (semAcesso) return { ok: false as const, error: semAcesso };

  // A tela nem oferece o botão, mas a action é um endereço que dá para chamar
  // direto. Abrir uma assinatura paga por cima de uma cortesia cobraria quem
  // não deve nada.
  const cortesia = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { complimentary: true },
  });
  if (cortesia?.complimentary) return { ok: false, error: EM_CORTESIA };

  const plan = await prisma.plan.findUnique({ where: { tier: tier as PlanOption['tier'] } });
  if (!plan || !plan.active) return { ok: false, error: 'Plano indisponível.' };

  const atual = await prisma.subscription.findUnique({ where: { tenantId }, select: { clinicEnabled: true, crmEnabled: true } });
  const product =
    parseProduct(productInput) ?? productOf({ clinicEnabled: atual?.clinicEnabled ?? true, crmEnabled: Boolean(atual?.crmEnabled) });
  if (!productAvailable(plan, product)) return { ok: false, error: `O ${PRODUCT_INFO[product].name} não está à venda no plano ${plan.name}.` };

  // Downgrading below the professionals already registered would silently put
  // the clinic over its own limit. Say so instead of selling a plan that does
  // not fit. Só conta com a agenda: no produto CRM não há profissionais.
  const inUse = await prisma.professional.count({ where: { tenantId, active: true } });
  if (product !== 'CRM' && plan.maxProfessionals !== null && inUse > plan.maxProfessionals) {
    return {
      ok: false,
      error: `Você tem ${inUse} profissionais ativos e o plano ${plan.name} permite ${plan.maxProfessionals}. Desative alguns antes de trocar.`,
    };
  }

  if (!isConfigured()) {
    return { ok: false, error: 'Cobrança ainda não configurada. Fale com o suporte.' };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, document: true, email: true, phone: true },
  });
  if (!tenant) return { ok: false, error: 'Clínica não encontrada.' };

  // Asaas accepts a customer without a document but refuses to issue the charge,
  // so checking here turns a confusing gateway error into one clear sentence —
  // and avoids leaving a half-created customer behind.
  const problem = documentError(tenant.document ?? '');
  if (problem) {
    return { ok: false, error: problem, needsDocument: true };
  }

  const existing = await prisma.subscription.findUnique({ where: { tenantId } });

  try {
    const customerId =
      existing?.asaasCustomerId ??
      (await ensureCustomer({
        tenantId,
        name: tenant.name,
        cpfCnpj: tenant.document,
        email: tenant.email,
        phone: tenant.phone,
      }));

    // Agenda e/ou CRM (pacote e quem passar do incluído), numa cobrança só.
    const cobranca = await billingFor(tenantId, plan, modulesOf(product));

    // Asaas rejects anything below this, and its own wording ("forma de pagamento
    // Pergunte ao Cliente") tells whoever set the price nothing useful.
    if (cobranca.valueCents < MIN_CHARGE_CENTS) {
      return {
        ok: false,
        error: `O valor mínimo de cobrança é ${(MIN_CHARGE_CENTS / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Ajuste o preço do plano ${plan.name}.`,
      };
    }

    // Switching plans updates the existing subscription instead of opening a
    // second one — two live subscriptions would bill the clinic twice.
    if (existing?.asaasSubscriptionId) {
      await updateSubscriptionValue(existing.asaasSubscriptionId, cobranca.valueCents, `${PRODUCT_INFO[product].name} ${plan.name}`, cobranca.description);
      await prisma.subscription.update({
        where: { tenantId },
        data: { tier: plan.tier, asaasCustomerId: customerId, billedValueCents: cobranca.valueCents },
      });
    } else {
      // A clinic still inside its trial keeps every day of it: the first charge
      // lands when the trial ends, not today.
      const firstDueDate =
        existing?.trialEndsAt && existing.trialEndsAt > new Date() ? existing.trialEndsAt : new Date();

      const sub = await createSubscription({
        customerId,
        tenantId,
        priceCents: cobranca.valueCents,
        planName: `${PRODUCT_INFO[product].name} ${plan.name}`,
        billingType: method,
        firstDueDate,
      });

      await prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          tier: plan.tier,
          status: 'ACTIVE',
          currentPeriodEnd: new Date(sub.nextDueDate),
          asaasCustomerId: customerId,
          asaasSubscriptionId: sub.id,
        },
        update: {
          tier: plan.tier,
          asaasCustomerId: customerId,
          asaasSubscriptionId: sub.id,
          currentPeriodEnd: new Date(sub.nextDueDate),
          cancelledAt: null,
          billedValueCents: cobranca.valueCents,
        },
      });
    }

    await applyProduct(tenantId, userId, product);

    const fresh = await prisma.subscription.findUnique({ where: { tenantId } });
    if (fresh?.asaasSubscriptionId) await syncCharges(tenantId, fresh.id, fresh.asaasSubscriptionId);

    const openCharge = await prisma.charge.findFirst({
      where: { tenantId, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
      select: { invoiceUrl: true },
    });

    refreshPlan();
    return { ok: true, invoiceUrl: openCharge?.invoiceUrl ?? undefined };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível criar a assinatura.',
    };
  }
}

/**
 * Troca o plano do teste grátis, sem assinar: tamanho e produto mudam na hora,
 * ninguém paga nada. Só vale enquanto o teste está aberto e sem assinatura —
 * depois disso, a troca é pelo `choosePlan`, que acerta o valor no Asaas.
 */
export async function switchTrialPlan(tier: string, productInput: string): Promise<{ ok: boolean; error?: string }> {
  const { tenantId, userId } = await requireTenant();

  const semAcesso = await capabilityBlocked(tenantId, 'planos');
  if (semAcesso) return { ok: false, error: semAcesso };

  const [plan, sub] = await Promise.all([
    prisma.plan.findUnique({ where: { tier: tier as PlanOption['tier'] } }),
    prisma.subscription.findUnique({ where: { tenantId } }),
  ]);
  const product = parseProduct(productInput);
  if (!plan || !plan.active || !product || !productAvailable(plan, product)) return { ok: false, error: 'Plano indisponível.' };
  if (!sub) return { ok: false, error: 'Assinatura não encontrada.' };
  if (sub.complimentary) return { ok: false, error: EM_CORTESIA };
  const access = resolveAccess({ ...sub, billingLinked: Boolean(sub.asaasSubscriptionId) });
  if (access.status !== 'TRIALING' || sub.asaasSubscriptionId) {
    return { ok: false, error: 'O teste grátis já terminou ou o plano já foi assinado. Escolha o plano para assinar.' };
  }

  await prisma.subscription.update({ where: { tenantId }, data: { tier: plan.tier } });
  await applyProduct(tenantId, userId, product);
  refreshPlan();
  return { ok: true };
}

/**
 * Cancela a assinatura da clínica.
 *
 * Toda tela de cobrança precisa de uma saída visível. Quando não tem, a pessoa
 * cancela ligando, reclamando, ou simplesmente parando de pagar — e nenhum dos
 * três é bom para ninguém.
 *
 * Duas decisões que importam aqui:
 *
 * 1. O acesso continua até o fim do período já pago. Quem pagou o mês tem o mês.
 * 2. Se o Asaas recusar o cancelamento, não marcamos nada do nosso lado. Uma
 *    tela dizendo "cancelado" enquanto a cobrança continua saindo todo mês é o
 *    pior defeito possível numa tela de cobrança.
 *
 * Não passa por `writeBlocked`: quem está com acesso limitado por falta de
 * pagamento é justamente quem mais precisa conseguir cancelar.
 */
export async function cancelPlan(): Promise<{ ok: boolean; error?: string; until?: string }> {
  const { tenantId } = await requireTenant();

  const semAcesso = await capabilityBlocked(tenantId, 'planos');
  if (semAcesso) return { ok: false, error: semAcesso };

  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) return { ok: false, error: 'Não há assinatura para cancelar.' };
  if (subscription.complimentary) return { ok: false, error: EM_CORTESIA };
  if (subscription.cancelledAt) {
    return { ok: false, error: 'Esta assinatura já está cancelada.' };
  }

  if (subscription.asaasSubscriptionId && isConfigured()) {
    try {
      await cancelSubscription(subscription.asaasSubscriptionId);
    } catch (error) {
      console.error('[cobranca] Asaas recusou o cancelamento', error);
      return {
        ok: false,
        error:
          'Não foi possível cancelar a cobrança agora. Tente de novo em alguns minutos. Nada foi alterado.',
      };
    }
  }

  await prisma.subscription.update({
    where: { tenantId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      // A assinatura não existe mais no Asaas. Zerar aqui faz o "reativar"
      // abrir uma nova em vez de tentar mexer numa que morreu.
      asaasSubscriptionId: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      action: `SUBSCRIPTION_CANCELLED_${subscription.tier}`,
      entity: 'Subscription',
      entityId: subscription.id,
    },
  });

  revalidatePath('/configuracoes');
  return { ok: true, until: subscription.currentPeriodEnd.toISOString() };
}
