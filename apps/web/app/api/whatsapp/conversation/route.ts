import { NextResponse } from 'next/server';
import { getTenantClient } from '@clinicaiq/db';
import { classifyConversation } from '@/crm/conversations';
import { bearerMatches } from '@/lib/bearer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * O gateway avisa que gravou uma conversa nova. Aqui ela é ligada ao lead ou
 * ao paciente com esse número, ou fica na Entrada do CRM. Autenticado com o
 * mesmo segredo compartilhado do resto da integração.
 */
export async function POST(req: Request) {
  if (!bearerMatches(req, process.env.WHATSAPP_GATEWAY_TOKEN)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : '';
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : '';
  if (!tenantId || !conversationId) {
    return NextResponse.json({ ok: false, error: 'tenant-and-conversation-required' }, { status: 400 });
  }
  const result = await classifyConversation(getTenantClient(tenantId), tenantId, conversationId);
  return NextResponse.json({ ok: true, result });
}
