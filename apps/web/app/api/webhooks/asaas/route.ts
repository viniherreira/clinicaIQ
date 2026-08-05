import { NextResponse } from 'next/server';
import { prisma } from '@clinicaiq/db';
import { toChargeStatus } from '@/lib/asaas';

/**
 * Asaas payment webhook.
 *
 * This is what turns a PIX that landed at 22h on a Sunday into a clinic that
 * can use its agenda on Monday morning without anyone at ClinicaIQ touching
 * anything.
 */

interface AsaasEvent {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    value?: number;
    dueDate?: string;
    paymentDate?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    subscription?: string;
    externalReference?: string;
  };
}

/**
 * Asaas authenticates webhooks with a token the account owner sets, sent back
 * as `asaas-access-token`. Without it this endpoint is a public switch for
 * marking any invoice paid, so a missing secret refuses every call rather than
 * defaulting to open.
 */
function authorized(req: Request): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) return false;
  return req.headers.get('asaas-access-token') === expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: AsaasEvent;
  try {
    body = (await req.json()) as AsaasEvent;
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const payment = body.payment;
  if (!payment?.id) {
    // Not a payment event (Asaas also sends subscription and transfer events).
    // Acknowledge so it is not retried forever.
    return NextResponse.json({ ok: true, ignored: body.event ?? 'sem evento' });
  }

  const charge = await prisma.charge.findUnique({
    where: { asaasChargeId: payment.id },
    select: { id: true, tenantId: true, subscriptionId: true },
  });

  const status = toChargeStatus(payment.status ?? '');
  const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : status === 'PAID' ? new Date() : null;

  if (charge) {
    await prisma.charge.update({
      where: { id: charge.id },
      data: {
        status,
        paidAt,
        invoiceUrl: payment.invoiceUrl ?? undefined,
        bankSlipUrl: payment.bankSlipUrl ?? undefined,
      },
    });
  } else if (payment.subscription) {
    // The charge can arrive before we ever synced it — Asaas issues the next
    // invoice on its own schedule. Record it against the subscription we know.
    const sub = await prisma.subscription.findFirst({
      where: { asaasSubscriptionId: payment.subscription },
      select: { id: true, tenantId: true },
    });
    if (sub) {
      await prisma.charge.create({
        data: {
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          asaasChargeId: payment.id,
          amountCents: Math.round((payment.value ?? 0) * 100),
          status,
          dueDate: payment.dueDate ? new Date(payment.dueDate) : new Date(),
          paidAt,
          invoiceUrl: payment.invoiceUrl ?? null,
          bankSlipUrl: payment.bankSlipUrl ?? null,
        },
      });
    }
  }

  // Move the subscription itself. Paying is the only thing that should ever
  // restore access, and it must restore it immediately.
  const subscriptionId = charge?.subscriptionId;
  const subscription = subscriptionId
    ? await prisma.subscription.findUnique({ where: { id: subscriptionId } })
    : payment.subscription
      ? await prisma.subscription.findFirst({ where: { asaasSubscriptionId: payment.subscription } })
      : null;

  if (subscription) {
    if (status === 'PAID') {
      // A month from the due date, not from today: paying three days late must
      // not push every future invoice three days later too.
      const base = payment.dueDate ? new Date(payment.dueDate) : new Date();
      const nextEnd = new Date(base);
      nextEnd.setMonth(nextEnd.getMonth() + 1);

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: base,
          currentPeriodEnd: nextEnd,
          graceEndsAt: null,
          trialEndsAt: null,
        },
      });
    } else if (status === 'OVERDUE') {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'PAST_DUE' },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
