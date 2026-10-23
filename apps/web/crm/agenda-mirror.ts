import { getTenantClient } from '@clinicaiq/db';
import { getTenantModules } from '@/lib/access';
import { ingestChat } from './chat-ingest';
import { classifyConversation } from './conversations';

/**
 * O aviso da agenda (confirmação, lembrete) que saiu pela API oficial aparece
 * na conversa do paciente no CRM, como no Kommo: tudo o que o número manda fica
 * no chat. Só com o CRM ligado; a agenda nunca depende disso, então quem chama
 * ignora qualquer falha daqui.
 */
export async function mirrorAgendaToCrm(
  tenantId: string,
  m: { phone: string; text: string; externalId: string; buttons: { payload: string; text: string }[]; at?: Date },
): Promise<boolean> {
  if (!(await getTenantModules(tenantId)).crm) return false;
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
