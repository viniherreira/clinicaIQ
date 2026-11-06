import { getTenantClient, prisma } from '@clinicaiq/db';
import { getTenantModules } from '@/lib/access';
import { ingestChat } from './chat-ingest';
import { windowOpen } from './cloud';
import { classifyConversation } from './conversations';
import { conversationHashes, leadHashesForChat } from './phone';

/**
 * O número já é do CRM? Tem conversa no WhatsApp do CRM (não recusada) ou um
 * lead (aberto, ganho ou perdido) com esse telefone ou desse paciente.
 */
export async function crmKnowsPatient(tenantId: string, phone: string, patientId?: string | null): Promise<boolean> {
  const db = getTenantClient(tenantId);
  const [conversa, lead] = await Promise.all([
    // Conversa recusada ou arquivada não conta: foi tirada do CRM de propósito.
    db.conversation.findFirst({ where: { phoneHash: { in: conversationHashes(phone, tenantId) }, status: { not: 'DECLINED' } }, select: { id: true } }),
    db.lead.findFirst({
      where: {
        deletedAt: null,
        OR: [{ phoneHash: { in: leadHashesForChat(phone, tenantId) } }, ...(patientId ? [{ patientId }] : [])],
      },
      select: { id: true },
    }),
  ]);
  return Boolean(conversa || lead);
}

/**
 * O aviso da agenda (confirmação, lembrete) que saiu pela API oficial aparece
 * na conversa do paciente no CRM, como no Kommo: tudo o que o número manda fica
 * no chat. Só com o CRM ligado, e só para quem já é do CRM: paciente que só
 * agendou na clínica não ganha conversa no CRM por causa do lembrete. A agenda
 * nunca depende disso, então quem chama ignora qualquer falha daqui.
 */
export async function mirrorAgendaToCrm(
  tenantId: string,
  m: {
    phone: string;
    text: string;
    externalId: string;
    buttons: { payload: string; text: string }[];
    at?: Date;
    patientId?: string | null;
  },
): Promise<boolean> {
  if (!(await getTenantModules(tenantId)).crm) return false;
  if (!(await crmKnowsPatient(tenantId, m.phone, m.patientId))) return false;
  const r = await ingestChat(tenantId, {
    externalId: m.externalId,
    direction: 'OUTBOUND',
    origin: 'AUTOMATION',
    phone: m.phone,
    kind: 'TEXT',
    text: m.text,
    buttons: m.buttons.map((b) => ({ id: b.payload, title: b.text })),
    at: m.at ?? new Date(),
  });
  if (!r.recorded) return false;
  // Conversa nova: liga ao paciente na hora, para não cair na Entrada como se fosse um interessado.
  if (r.isNew) await classifyConversation(getTenantClient(tenantId), tenantId, r.conversationId);
  return true;
}

/**
 * O paciente escreveu nas últimas 24 horas? Então o aviso da agenda pode sair
 * como mensagem comum com botões: grátis e sem depender de cartão na Meta. Olha
 * a conversa do CRM e, sem ela, a última resposta do paciente na agenda.
 */
export async function patientWindowOpen(tenantId: string, phone: string, patientId: string, now = new Date()): Promise<boolean> {
  const [conversa, resposta] = await Promise.all([
    getTenantClient(tenantId).conversation.findFirst({
      where: { phoneHash: { in: conversationHashes(phone, tenantId) } },
      select: { lastInboundAt: true },
    }),
    prisma.whatsAppMessage.findFirst({
      where: { tenantId, patientId, direction: 'INBOUND' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  return windowOpen(conversa?.lastInboundAt ?? null, now) || windowOpen(resposta?.createdAt ?? null, now);
}
