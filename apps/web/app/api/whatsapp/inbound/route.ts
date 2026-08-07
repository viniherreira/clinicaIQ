import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { bearerMatches, secretMatches } from '@/lib/bearer';
import { resolveAppointmentByPhone, applyAppointmentResponse, optOutByPhone } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Receives a patient's WhatsApp reply forwarded by the gateway (the always-on
 * service that holds each clinic's socket). Authenticated with the same shared
 * token the app uses to talk to the gateway. Maps the reply to an appointment
 * and updates its status — this is what makes "responda 1 para confirmar"
 * actually flip the appointment to Confirmado in the agenda.
 */
function authorized(req: Request): boolean {
  return bearerMatches(req, process.env.WHATSAPP_GATEWAY_TOKEN);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : '';
  const from = typeof body?.from === 'string' ? body.from : '';
  if (!tenantId || !from) {
    return NextResponse.json({ ok: false, error: 'tenant-and-from-required' }, { status: 400 });
  }

  const text = typeof body?.text === 'string' ? body.text : '';

  // Opt-out wins over everything else: a patient asking to stop must stop, even
  // if the same message could be read as an appointment reply.
  if (/^\s*(sair|parar|descadastrar|remover|stop)\b/i.test(text)) {
    const opted = await optOutByPhone(from, tenantId);
    return NextResponse.json({ ok: true, optOut: opted });
  }

  const appointmentId = await resolveAppointmentByPhone(from, tenantId);
  if (!appointmentId) {
    // Reply from someone without a recent appointment — nothing to do, but not
    // an error (the message still reaches the clinic's WhatsApp).
    return NextResponse.json({ ok: true, matched: false });
  }

  const changed = await applyAppointmentResponse(appointmentId, {
    buttonReplyId: typeof body.buttonId === 'string' ? body.buttonId : undefined,
    text: typeof body.text === 'string' ? body.text : undefined,
    externalId: typeof body.messageId === 'string' ? body.messageId : undefined,
    tenantId,
  });

  if (changed) {
    revalidatePath('/agenda');
    revalidatePath('/dashboard');
  }

  return NextResponse.json({ ok: true, matched: true, changed });
}
