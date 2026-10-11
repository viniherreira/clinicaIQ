import { NextResponse } from 'next/server';
import { getTenantClient } from '@clinicaiq/db';
import { afterInbound } from '@/crm/inbound';
import { bearerMatches } from '@/lib/bearer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * O gateway avisa que gravou uma mensagem do contato (ou uma conversa nova).
 * Aqui a conversa é ligada ao lead ou ao paciente (ou fica na Entrada), o
 * "SAIR" é registrado e o robô responde. Autenticado com o mesmo segredo
 * compartilhado do resto da integração.
 */
export async function POST(req: Request) {
  if (!bearerMatches(req, process.env.WHATSAPP_GATEWAY_TOKEN)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : '';
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : '';
  const externalId = typeof body?.externalId === 'string' ? body.externalId : '';
  if (!tenantId || !conversationId) {
    return NextResponse.json({ ok: false, error: 'tenant-and-conversation-required' }, { status: 400 });
  }
  const msg = externalId
    ? await getTenantClient(tenantId).chatMessage.findFirst({ where: { externalId, conversationId }, select: { id: true } })
    : null;
  await afterInbound(tenantId, conversationId, msg?.id ?? null);
  return NextResponse.json({ ok: true });
}
