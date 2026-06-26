'use server';

import { prisma } from '@clinicaiq/db';
import { headers } from 'next/headers';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export type PublicResult = { ok: boolean; message?: string };

/**
 * Loads a quote by its public token for the patient-facing page. Records the
 * first view (SENT → VIEWED) and flips expired quotes. No auth — the token is
 * the capability.
 */
export async function getPublicQuote(token: string) {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: {
      items: { orderBy: { id: 'asc' } },
      patient: { select: { name: true } },
      tenant: { select: { name: true, phone: true, email: true } },
    },
  });
  if (!quote) return null;

  const now = new Date();
  let status = quote.status;

  if ((status === 'SENT' || status === 'VIEWED') && quote.validUntil < now) {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: 'EXPIRED' } });
    status = 'EXPIRED';
  } else if (status === 'SENT') {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: 'VIEWED', viewedAt: quote.viewedAt ?? now },
    });
    status = 'VIEWED';
  }

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
    items: quote.items.map((it) => ({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      discountPercent: Number(it.discountPercent ?? 0),
      total: Number(it.total),
    })),
  };
}

async function respond(
  token: string,
  decision: 'ACCEPTED' | 'REJECTED',
  reason?: string,
): Promise<PublicResult> {
  const h = await headers();
  const ip = clientIp(h);
  const rl = rateLimit(`quote-respond:${ip}`, 15, 60_000);
  if (!rl.ok) return { ok: false, message: 'Muitas tentativas. Tente novamente em instantes.' };

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    select: { id: true, status: true, validUntil: true, tenantId: true },
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

  return { ok: true };
}

export async function acceptPublicQuote(token: string): Promise<PublicResult> {
  return respond(token, 'ACCEPTED');
}

export async function rejectPublicQuote(token: string, reason: string): Promise<PublicResult> {
  return respond(token, 'REJECTED', reason);
}
