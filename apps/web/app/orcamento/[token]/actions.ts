'use server';

import { prisma } from '@clinicaiq/db';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { notifyCrm } from '@/crm/notify';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { describePayment } from '@/lib/payment-terms';

export type PublicResult = { ok: boolean; message?: string };

/**
 * Loads a quote by its public token for the patient-facing page. No auth — the
 * token is the capability.
 *
 * Só lê. Marcar "Visualizado" aqui, no carregamento, fazia a pré-visualização
 * de link do WhatsApp (que abre a página assim que a clínica envia) contar como
 * o paciente vendo. Quem marca é `markPublicQuoteViewed`, chamada pelo
 * navegador do paciente. Vencido aparece como expirado sem gravar nada; o
 * `respond` grava quando alguém tenta responder.
 */
export async function getPublicQuote(token: string) {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: {
      items: { orderBy: { id: 'asc' } },
      patient: { select: { name: true } },
      tenant: { select: { name: true, phone: true, email: true } },
      professional: { select: { name: true, registration: true } },
    },
  });
  if (!quote) return null;

  const status =
    (quote.status === 'SENT' || quote.status === 'VIEWED') && quote.validUntil < new Date() ? 'EXPIRED' : quote.status;

  return {
    number: quote.number,
    status,
    clinicName: quote.tenant.name,
    clinicPhone: quote.tenant.phone,
    patientName: quote.patient.name,
    validUntil: quote.validUntil.toISOString(),
    notes: quote.notes,
    rejectReason: quote.rejectReason,
    subtotal: Number(quote.subtotal),
    total: Number(quote.total),
    discountType: quote.discountType,
    discountValue: Number(quote.discountValue),
    payment: describePayment({
      total: Number(quote.total),
      downPayment: Number(quote.downPayment),
      installments: quote.installments,
      method: quote.paymentMethod,
    }),
    professional: quote.professional
      ? [quote.professional.name, quote.professional.registration].filter(Boolean).join(' · ')
      : null,
    items: quote.items.map((it) => ({
      id: it.id,
      name: it.name,
      description: it.description,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      discountPercent: Number(it.discountPercent ?? 0),
      total: Number(it.total),
    })),
  };
}

/**
 * O paciente abriu o orçamento (chamada pelo navegador dele, depois que a página
 * carregou: robô de pré-visualização não roda isso). Só o primeiro SENT → VIEWED.
 */
export async function markPublicQuoteViewed(token: string): Promise<void> {
  if (typeof token !== 'string' || !token) return;
  await prisma.quote.updateMany({
    where: { publicToken: token, status: 'SENT', validUntil: { gte: new Date() } },
    data: { status: 'VIEWED', viewedAt: new Date() },
  });
}

async function respond(
  token: string,
  decision: 'ACCEPTED' | 'REJECTED',
  reason?: string,
): Promise<PublicResult> {
  const h = await headers();
  const ip = clientIp(h);
  const rl = await rateLimit(`quote-respond:${ip}`, 15, 60_000);
  if (!rl.ok) return { ok: false, message: 'Muitas tentativas. Tente novamente em instantes.' };

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    select: { id: true, status: true, validUntil: true, tenantId: true, patientId: true },
  });
  if (!quote) return { ok: false, message: 'Orçamento não encontrado.' };
  if (quote.status !== 'SENT' && quote.status !== 'VIEWED') {
    return { ok: false, message: 'Este orçamento já foi respondido.' };
  }
  if (quote.validUntil < new Date()) {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: 'EXPIRED' } });
    return { ok: false, message: 'Este orçamento expirou.' };
  }

  await prisma.quote.update({
    where: { id: quote.id },
    data:
      decision === 'ACCEPTED'
        ? { status: 'ACCEPTED', acceptedAt: new Date() }
        : { status: 'REJECTED', rejectedAt: new Date(), rejectReason: reason?.slice(0, 500) || null },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: quote.tenantId,
      action: decision === 'ACCEPTED' ? 'QUOTE_ACCEPTED' : 'QUOTE_REJECTED',
      entity: 'Quote',
      entityId: quote.id,
      ipAddress: ip,
    },
  });

  after(() =>
    notifyCrm(
      quote.tenantId,
      decision === 'ACCEPTED'
        ? { type: 'quote.accepted', patientId: quote.patientId, quoteId: quote.id }
        : { type: 'quote.rejected', patientId: quote.patientId, quoteId: quote.id, reason },
    ),
  );

  return { ok: true };
}

export async function acceptPublicQuote(token: string): Promise<PublicResult> {
  return respond(token, 'ACCEPTED');
}

export async function rejectPublicQuote(token: string, reason: string): Promise<PublicResult> {
  return respond(token, 'REJECTED', reason);
}
