import type { TenantPrismaClient } from '@clinicaiq/db';
import type { Actor } from './leads';
import { conversationHashes, decryptPhone, encryptPhone, phoneHash } from './phone';

/** O nome que fica no lugar, para o Painel continuar contando sem dizer quem era. */
export const ERASED_NAME = 'Dados apagados (LGPD)';

export type EraseResult =
  | { ok: true; leads: number; conversations: number; mediaRefs: string[] }
  | { ok: false; message: string };

/**
 * Apaga os dados pessoais de quem pediu (LGPD, art. 18), a partir de um lead.
 *
 * O pedido é da pessoa, não do negócio: vale para todos os leads com o mesmo
 * telefone e para as conversas do WhatsApp dela. Some tudo que identifica —
 * nome, telefone, e-mail, observações, notas, tarefas, tags, mensagens e
 * arquivos. Fica só o esqueleto sem identificação (etapa, origem, valor,
 * ganho/perda): o negócio fechado continua nos números do Painel; o aberto
 * sai do funil.
 *
 * A ficha de paciente não é tocada: o prontuário tem prazo legal de guarda e
 * é decisão da clínica, fora do CRM. O vínculo do lead com ela é desfeito.
 *
 * Os arquivos guardados voltam em `mediaRefs` para quem chama apagar depois
 * da transação (o depósito de arquivos não participa dela).
 */
export async function eraseLeadPersonalData(db: TenantPrismaClient, actor: Actor, leadId: string, now: Date = new Date()): Promise<EraseResult> {
  const { tenantId } = actor;
  const lead = await db.lead.findFirst({ where: { id: leadId }, select: { id: true, phoneEncrypted: true, phoneHash: true, name: true } });
  if (!lead) return { ok: false, message: 'Lead não encontrado.' };
  if (lead.name === ERASED_NAME) return { ok: false, message: 'Os dados deste lead já foram apagados.' };

  const phone = decryptPhone(lead.phoneEncrypted, tenantId);
  const leads = await db.lead.findMany({
    where: { OR: [{ id: lead.id }, { phoneHash: lead.phoneHash }] },
    select: { id: true, wonAt: true, lostAt: true, deletedAt: true },
  });
  const leadIds = leads.map((l) => l.id);
  const conversations = await db.conversation.findMany({
    where: { OR: [{ leadId: { in: leadIds } }, ...(phone ? [{ phoneHash: { in: conversationHashes(phone, tenantId) } }] : [])] },
    select: { id: true },
  });
  const convIds = conversations.map((c) => c.id);
  const comArquivo = await db.chatMessage.findMany({
    where: { conversationId: { in: convIds }, mediaRef: { not: null } },
    select: { mediaRef: true },
  });
  const mediaRefs = comArquivo
    .map((m) => m.mediaRef!)
    .filter((r) => r.startsWith('store:') || r.startsWith('local:'));

  await db.$transaction(async (tx) => {
    await tx.broadcastRecipient.deleteMany({ where: { OR: [{ leadId: { in: leadIds } }, { conversationId: { in: convIds } }] } });
    await tx.automationRun.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.chatMessage.deleteMany({ where: { conversationId: { in: convIds } } });
    await tx.conversation.deleteMany({ where: { id: { in: convIds } } });
    await tx.leadTask.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.leadActivity.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.leadTagOnLead.deleteMany({ where: { leadId: { in: leadIds } } });
    for (const { id, wonAt, lostAt, deletedAt } of leads) {
      const aberto = !wonAt && !lostAt;
      // Um telefone e um índice que não batem com ninguém: o número some de vez.
      await tx.lead.updateMany({
        where: { id },
        data: {
          name: ERASED_NAME,
          title: null,
          email: null,
          notes: null,
          phoneEncrypted: encryptPhone('', tenantId),
          phoneHash: phoneHash(`apagado-${id}`, tenantId),
          patientId: null,
          whatsappOptOut: true,
          ...(aberto && !deletedAt ? { deletedAt: now } : {}),
          updatedById: actor.userId,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actor.userId,
        action: 'LEAD_PERSONAL_DATA_ERASED',
        entity: 'Lead',
        entityId: lead.id,
        metadata: { leads: leadIds.length, conversations: convIds.length, files: mediaRefs.length },
      },
    });
  });

  return { ok: true, leads: leadIds.length, conversations: convIds.length, mediaRefs };
}
