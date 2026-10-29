import { NextResponse } from 'next/server';
import { prisma } from '@clinicaiq/db';
import { chargeStatusFromEvent } from '@/lib/asaas-events';
import { getPayment, type AsaasPayment } from '@/lib/asaas';
import { secretMatches } from '@/lib/bearer';

/**
 * Asaas payment webhook.
 *
 * This is what turns a PIX that landed at 22h on a Sunday into a clinic that
 * can use its agenda on Monday morning without anyone at DreamClin touching
 * anything.
 */

/** Do aviso só se usa o id da cobrança: o resto vem da API do Asaas. */
interface AsaasEvent {
  event?: string;
  payment?: { id?: string };
}

/**
 * Asaas authenticates webhooks with a token the account owner sets, sent back
 * as `asaas-access-token`. Without it this endpoint is a public switch for
 * marking any invoice paid, so a missing secret refuses every call rather than
 * defaulting to open.
 */
function authorized(req: Request): boolean {
  return secretMatches(req.headers.get('asaas-access-token'), process.env.ASAAS_WEBHOOK_TOKEN);
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

  const aviso = body.payment;
  if (!aviso?.id) {
    // Not a payment event (Asaas also sends subscription and transfer events).
    // Acknowledge so it is not retried forever.
    return NextResponse.json({ ok: true, ignored: body.event ?? 'sem evento' });
  }

  // O corpo do aviso só diz *qual* cobrança mudou. Situação e valor vêm da API
  // do Asaas: com o token do webhook vazado, um POST dizendo "pago" liberava o
  // plano de qualquer clínica. Fora do ar, 503 — o Asaas tenta de novo.
  let payment: AsaasPayment;
  try {
    payment = await getPayment(aviso.id);
  } catch (e) {
    console.error('[asaas webhook] não deu para conferir a cobrança', aviso.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'asaas-indisponivel' }, { status: 503 });
  }

  const charge = await prisma.charge.findUnique({
    where: { asaasChargeId: payment.id },
    select: { id: true, tenantId: true, subscriptionId: true, amountCents: true },
  });

  const status = chargeStatusFromEvent(undefined, payment);
  const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : status === 'PAID' ? new Date() : null;
  // Pago a menos do que a cobrança vale não devolve o acesso.
  const valorConfere = !charge || Math.round((payment.value ?? 0) * 100) >= charge.amountCents;

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

  // Cortesia não tem status a mover: não vence, não atrasa, e um aviso tardio
  // de uma cobrança antiga não pode marcar como inadimplente quem não deve nada.
  if (subscription && !subscription.complimentary) {
    if (status === 'PAID' && !valorConfere) {
      console.error('[asaas webhook] pago abaixo do valor da cobrança; plano não liberado', payment.id, payment.value);
    } else if (status === 'PAID') {
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
