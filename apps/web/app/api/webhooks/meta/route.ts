import { NextResponse } from 'next/server';
import { parseCloudWebhook, verifyMetaSignature } from '@clinicaiq/whatsapp';
import { accountByPhoneNumberId, accountByWabaId } from '@/lib/cloud-account';
import { AGENDA_PAYLOADS as PAYLOADS } from '@/lib/agenda-options';
import { applyTemplateStatus } from '@/lib/agenda-templates-sync';
import { applyChatStatus, ingestChat } from '@/crm/chat-ingest';
import { afterInbound } from '@/crm/inbound';
import { getTenantModules } from '@/lib/access';
import { secretMatches } from '@/lib/bearer';
import { applyAppointmentResponse, applyMessageStatus, resolveAppointmentByPhone, resolveResponseStatus } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AGENDA_PAYLOADS = new Set<string>(PAYLOADS);

/**
 * Webhook da API oficial do WhatsApp (Cloud API): as conversas do CRM e as
 * respostas aos avisos da agenda (com ou sem CRM).
 *
 * Cada evento traz o `phone_number_id` do número que recebeu: é por ele que se
 * descobre a clínica. A situação dos modelos vem pela conta (WABA). A
 * assinatura da Meta (`X-Hub-Signature-256`) é conferida antes de qualquer
 * coisa; sem `META_APP_SECRET`, nada é aceito.
 *
 * O webhook antigo (/api/webhooks/whatsapp, um número fixo) continua como está.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    url.searchParams.get('hub.mode') === 'subscribe' &&
    secretMatches(url.searchParams.get('hub.verify_token'), process.env.META_WEBHOOK_VERIFY_TOKEN)
  ) {
    return new NextResponse(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), process.env.META_APP_SECRET)) {
    // Sem isto a recusa é silenciosa: a Meta mostra o evento como entregue e nada entra no CRM.
    console.warn('[meta webhook] assinatura recusada', process.env.META_APP_SECRET ? 'confira META_APP_SECRET' : 'META_APP_SECRET ausente');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Clínica de cada número. O CRM é opcional: sem ele, só os avisos da agenda.
  const tenants = new Map<string, { tenantId: string; crm: boolean } | null>();
  const tenantOf = async (phoneNumberId: string) => {
    if (!tenants.has(phoneNumberId)) {
      const account = await accountByPhoneNumberId(phoneNumberId);
      tenants.set(phoneNumberId, account?.active ? { tenantId: account.tenantId, crm: (await getTenantModules(account.tenantId)).crm } : null);
    }
    return tenants.get(phoneNumberId) ?? null;
  };

  // A Meta reenvia o que não recebeu 200; um evento ruim não pode travar os outros.
  for (const ev of parseCloudWebhook(body)) {
    try {
      if (ev.kind === 'template') {
        const account = await accountByWabaId(ev.wabaId);
        if (account) await applyTemplateStatus(account.tenantId, ev.templateId, ev.event, ev.reason);
        continue;
      }

      const t = await tenantOf(ev.phoneNumberId);
      if (!t) continue;
      const { tenantId } = t;

      if (ev.kind === 'status') {
        await applyMessageStatus(ev.id, ev.status.toLowerCase() as Lowercase<typeof ev.status>);
        if (t.crm) await applyChatStatus(tenantId, ev.id, ev.status, ev.error);
        continue;
      }

      // Resposta a um aviso da agenda (botão Confirmar/Reagendar, ou "1"/"2").
      let tocouBotaoDaAgenda = false;
      if (ev.kind === 'message') {
        const text = ev.content.text ?? undefined;
        const buttonReplyId = ev.content.buttonId;
        if (resolveResponseStatus(buttonReplyId, text)) {
          const appointmentId = await resolveAppointmentByPhone(ev.from, tenantId);
          const aplicou = appointmentId
            ? await applyAppointmentResponse(appointmentId, { buttonReplyId, text, externalId: ev.id, tenantId })
            : false;
          tocouBotaoDaAgenda = aplicou && AGENDA_PAYLOADS.has(buttonReplyId ?? '');
        }
      }

      if (!t.crm) continue;
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
        // Ligar a conversa, captação e robô aqui mesmo, antes de responder à Meta
        // (como no gateway): com `after()`, em produção, não rodava — número novo
        // ficava na Entrada e o robô não começava. Se demorar e a Meta reenviar,
        // a mensagem já gravada não roda de novo (`recorded: false`).
        // Quem tocou Confirmar no lembrete não deve cair no menu do robô.
        await afterInbound(tenantId, r.conversationId, r.messageId, { skipBot: tocouBotaoDaAgenda }).catch((e) =>
          console.error('[meta webhook] depois da mensagem falhou', e instanceof Error ? e.message : e),
        );
      }
    } catch (e) {
      console.error('[meta webhook] evento não processado', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true });
}
