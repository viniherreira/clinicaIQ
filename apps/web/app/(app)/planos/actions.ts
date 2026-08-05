'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@clinicaiq/db';
import {
  createSubscription,
  ensureCustomer,
  getPixCode,
  isConfigured,
  isSandbox,
  listPayments,
  toChargeStatus,
  updateSubscriptionValue,
} from '@/lib/asaas';
import { NO_SUBSCRIPTION, resolveAccess, type Access } from '@/lib/subscription';

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');

  return { tenantId: tenant.id };
}

export interface PlanOption {
  tier: 'ESSENCIAL' | 'PROFISSIONAL' | 'CLINICA';
  name: string;
  description: string;
  monthlyPriceCents: number;
  maxProfessionals: number | null;
  whatsappEnabled: boolean;
  campaignsEnabled: boolean;
  assistantEnabled: boolean;
  advancedReports: boolean;
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
  professionalsInUse: number;
  charges: ChargeRow[];
  /** True while pointing at the Asaas sandbox — shown so nobody mistakes a test charge for real. */
  sandbox: boolean;
  gatewayReady: boolean;
}

export async function getBillingData(): Promise<BillingData> {
  const { tenantId } = await requireTenant();

  const [plans, subscription, professionalsInUse] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.subscription.findUnique({ where: { tenantId } }),
    prisma.professional.count({ where: { tenantId, active: true } }),
  ]);

  const access = subscription
    ? resolveAccess(
        {
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
          graceEndsAt: subscription.graceEndsAt,
          cancelledAt: subscription.cancelledAt,
        },
        new Date(),
      )
    : NO_SUBSCRIPTION;

  // Pull fresh charges from Asaas when linked, so a payment made minutes ago is
  // visible even if the webhook has not landed yet.
  if (subscription?.asaasSubscriptionId && isConfigured()) {
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
      assistantEnabled: p.assistantEnabled,
      advancedReports: p.advancedReports,
      current: subscription?.tier === p.tier,
    })),
    access,
    currentTier: subscription?.tier ?? null,
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
}

export async function choosePlan(tier: string): Promise<ChoosePlanResult> {
  const { tenantId } = await requireTenant();

  const plan = await prisma.plan.findUnique({ where: { tier: tier as PlanOption['tier'] } });
  if (!plan || !plan.active) return { ok: false, error: 'Plano indisponível.' };

  // Downgrading below the professionals already registered would silently put
  // the clinic over its own limit. Say so instead of selling a plan that does
  // not fit.
  const inUse = await prisma.professional.count({ where: { tenantId, active: true } });
  if (plan.maxProfessionals !== null && inUse > plan.maxProfessionals) {
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

    // Switching plans updates the existing subscription instead of opening a
    // second one — two live subscriptions would bill the clinic twice.
    if (existing?.asaasSubscriptionId) {
      await updateSubscriptionValue(existing.asaasSubscriptionId, plan.monthlyPriceCents, plan.name);
      await prisma.subscription.update({
        where: { tenantId },
        data: { tier: plan.tier, asaasCustomerId: customerId },
      });
    } else {
      // A clinic still inside its trial keeps every day of it: the first charge
      // lands when the trial ends, not today.
      const firstDueDate =
        existing?.trialEndsAt && existing.trialEndsAt > new Date() ? existing.trialEndsAt : new Date();

      const sub = await createSubscription({
        customerId,
        tenantId,
        priceCents: plan.monthlyPriceCents,
        planName: plan.name,
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
        },
      });
    }

    const fresh = await prisma.subscription.findUnique({ where: { tenantId } });
    if (fresh?.asaasSubscriptionId) await syncCharges(tenantId, fresh.id, fresh.asaasSubscriptionId);

    const openCharge = await prisma.charge.findFirst({
      where: { tenantId, status: { in: ['PENDING', 'OVERDUE'] } },
      orderBy: { dueDate: 'asc' },
      select: { invoiceUrl: true },
    });

    revalidatePath('/planos');
    return { ok: true, invoiceUrl: openCharge?.invoiceUrl ?? undefined };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível criar a assinatura.',
    };
  }
}
