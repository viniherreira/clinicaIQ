import { decrypt, getTenantClient } from '@clinicaiq/db';
import { runBotOnInbound } from './bot';
import { classifyConversation } from './conversations';

/**
 * O que acontece no CRM depois de gravada uma mensagem do contato — venha ela
 * do gateway de QR (aviso em /api/whatsapp/conversation) ou da API oficial
 * (webhook da Meta): ligar a conversa, registrar o pedido de sair e deixar o
 * robô responder.
 */

export const OPT_OUT = /^\s*(sair|parar|descadastrar|remover|stop)\b/i;

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

export async function afterInbound(tenantId: string, conversationId: string, messageId: string | null): Promise<void> {
  const db = getTenantClient(tenantId);
  await classifyConversation(db, tenantId, conversationId);
  if (!messageId) return;

  const msg = await db.chatMessage.findFirst({
    where: { id: messageId, origin: 'CONTACT' },
    select: { id: true, textEncrypted: true },
  });
  if (!msg) return;

  let text = '';
  try {
    text = msg.textEncrypted ? decrypt(msg.textEncrypted, masterKey(), tenantId) : '';
  } catch {
    text = '';
  }

  // "SAIR": transmissões e automações param de mandar para esse negócio.
  if (OPT_OUT.test(text)) {
    const conv = await db.conversation.findFirst({ where: { id: conversationId }, select: { leadId: true, patientId: true } });
    if (conv?.leadId) await db.lead.updateMany({ where: { id: conv.leadId }, data: { whatsappOptOut: true } });
    if (conv?.patientId) await db.patient.updateMany({ where: { id: conv.patientId }, data: { whatsappOptOut: true } });
    await db.conversation.updateMany({
      where: { id: conversationId },
      data: { botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0 },
    });
    return;
  }

  try {
    await runBotOnInbound(tenantId, conversationId, msg.id);
  } catch (e) {
    console.error('[crm] robô falhou', e instanceof Error ? e.message : e);
  }
}
