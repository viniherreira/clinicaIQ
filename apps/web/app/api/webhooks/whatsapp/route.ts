import { NextResponse } from 'next/server';
import { getWhatsAppProvider } from '@clinicaiq/whatsapp';
import {
  applyAppointmentResponse,
  applyMessageStatus,
  resolveAppointmentByPhone,
} from '@/lib/whatsapp';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { directShapeAllowed, legacyWebhookAuthorized } from '@/lib/legacy-webhook-auth';
import { secretMatches } from '@/lib/bearer';

export const runtime = 'nodejs';

/**
 * GET — Meta webhook verification handshake.
 * Meta calls this once with hub.challenge; echo it back when the verify token
 * matches WHATSAPP_VERIFY_TOKEN.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && secretMatches(token, process.env.WHATSAPP_VERIFY_TOKEN)) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * POST — inbound events.
 *
 * Accepts the Meta webhook envelope (parsed by the active provider) and also a
 * simplified mock shape `{ appointmentId, buttonReplyId | text }` used by the
 * dev mock flow and tests. Always returns 200 quickly so the provider does not
 * retry on transient app errors.
 *
 * Em produção só aceita o que a Meta assinou, e o atalho por id de agendamento
 * não existe (ver `lib/legacy-webhook-auth.ts`).
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const limited = rateLimit(`wa-webhook:${ip}`, 120, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } },
    );
  }

  const body = await req.text();
  if (!legacyWebhookAuthorized(body, req.headers.get('x-hub-signature-256'), process.env)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    // Direct mock/test shape — lets dev simulate a patient response.
    const direct = raw as { appointmentId?: string; buttonReplyId?: string; text?: string };
    if (directShapeAllowed(process.env) && direct.appointmentId && (direct.buttonReplyId || direct.text)) {
      await applyAppointmentResponse(direct.appointmentId, {
        buttonReplyId: direct.buttonReplyId,
        text: direct.text,
      });
      return NextResponse.json({ ok: true });
    }

    // Provider envelope (Meta, or the mock provider's flat shape).
    const payload = getWhatsAppProvider().parseWebhook(raw);
    if (!payload) return NextResponse.json({ ok: true });

    if (payload.type === 'status' && payload.status && payload.messageId) {
      await applyMessageStatus(payload.messageId, payload.status);
      return NextResponse.json({ ok: true });
    }

    if (payload.type === 'button_reply' || payload.type === 'text') {
      const appointmentId = await resolveAppointmentByPhone(payload.from);
      if (appointmentId) {
        await applyAppointmentResponse(appointmentId, {
          buttonReplyId: payload.buttonReplyId,
          text: payload.text,
          externalId: payload.messageId,
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp webhook] processing error', err);
    return NextResponse.json({ ok: true });
  }
}
