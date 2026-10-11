import { NextResponse, after } from 'next/server';
import { parseCloudWebhook, verifyMetaSignature } from '@clinicaiq/whatsapp';
import { accountByPhoneNumberId } from '@/crm/cloud';
import { applyChatStatus, ingestChat } from '@/crm/chat-ingest';
import { afterInbound } from '@/crm/inbound';
import { getTenantModules } from '@/lib/access';
import { applyAppointmentResponse, resolveAppointmentByPhone } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Webhook da API oficial do WhatsApp (Cloud API) para as conversas do CRM.
 *
 * Cada evento traz o `phone_number_id` do número que recebeu: é por ele que se
 * descobre a clínica. A assinatura da Meta (`X-Hub-Signature-256`) é conferida
 * antes de qualquer coisa; sem `META_APP_SECRET`, nada é aceito.
 *
 * O webhook antigo (/api/webhooks/whatsapp, um número fixo) continua como está.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (url.searchParams.get('hub.mode') === 'subscribe' && expected && url.searchParams.get('hub.verify_token') === expected) {
    return new NextResponse(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), process.env.META_APP_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const tenants = new Map<string, string | null>();
  const tenantOf = async (phoneNumberId: string) => {
    if (!tenants.has(phoneNumberId)) {
      const account = await accountByPhoneNumberId(phoneNumberId);
      const ok = account && account.active && (await getTenantModules(account.tenantId)).crm;
      tenants.set(phoneNumberId, ok ? account.tenantId : null);
    }
    return tenants.get(phoneNumberId) ?? null;
  };

  // A Meta reenvia o que não recebeu 200; um evento ruim não pode travar os outros.
  for (const ev of parseCloudWebhook(body)) {
    try {
      const tenantId = await tenantOf(ev.phoneNumberId);
      if (!tenantId) continue;

      if (ev.kind === 'status') {
        await applyChatStatus(tenantId, ev.id, ev.status, ev.error);
        continue;
      }

      const r = await ingestChat(tenantId, {
        externalId: ev.id,
        direction: ev.kind === 'message' ? 'INBOUND' : 'OUTBOUND',
        origin: ev.kind === 'message' ? 'CONTACT' : 'PHONE',
        phone: ev.kind === 'message' ? ev.from : ev.to,
        contactName: ev.kind === 'message' ? ev.contactName : null,
        kind: ev.content.kind,
        text: ev.content.text,
        mediaRef: ev.content.mediaRef,
        mimeType: ev.content.mimeType,
        at: ev.at,
      });

      if (ev.kind === 'message' && r.recorded) {
        const conversationId = r.conversationId;
        const messageId = r.messageId;
        after(() => afterInbound(tenantId, conversationId, messageId));

        // Resposta a uma confirmação de consulta chegando pelo número oficial.
        const from = ev.from;
        const text = ev.content.text ?? undefined;
        const buttonReplyId = ev.content.buttonId;
        after(async () => {
          const appointmentId = await resolveAppointmentByPhone(from, tenantId);
          if (appointmentId) await applyAppointmentResponse(appointmentId, { buttonReplyId, text, externalId: ev.id, tenantId });
        });
      }
    } catch (e) {
      console.error('[meta webhook] evento não processado', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true });
}
