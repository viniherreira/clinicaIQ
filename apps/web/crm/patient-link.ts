import type { TenantPrismaClient } from '@clinicaiq/db';
import { forgetPatientKeys } from './conversations';
import { OPEN_LEAD } from './leads';
import { conversationHashes, decryptPhone, leadHashesForChat } from './phone';

/**
 * A pessoa chegou pelo WhatsApp, virou lead, e a recepção a cadastrou como
 * paciente direto na agenda. Pelo telefone, o lead aberto e a conversa passam a
 * ser desse paciente: assim o funil anda quando ela é agendada, e o aviso da
 * agenda cai na mesma conversa, sem abrir outro lead para aceitar.
 *
 * Só pega lead sem paciente (não rouba o lead de outra ficha) e devolve o lead
 * ligado, ou null.
 */
export async function adoptLeadByPhone(db: TenantPrismaClient, tenantId: string, patientId: string) {
  const patient = await db.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: { id: true, name: true, phoneEncrypted: true, phone2Encrypted: true },
  });
  if (!patient) return null;
  const phones = [patient.phoneEncrypted, patient.phone2Encrypted].flatMap((c) => (c ? [decryptPhone(c, tenantId)] : [])).filter(Boolean);
  if (!phones.length) return null;

  // Telefone novo na clínica: a conversa do WhatsApp deixa de achar "ninguém".
  forgetPatientKeys();

  const lead = await db.lead.findFirst({
    where: { patientId: null, phoneHash: { in: phones.flatMap((p) => leadHashesForChat(p, tenantId)) }, ...OPEN_LEAD },
    orderBy: { createdAt: 'desc' },
  });
  const conversas = phones.flatMap((p) => conversationHashes(p, tenantId));

  return db.$transaction(async (tx) => {
    // A conversa do número, ainda sem paciente, é deste paciente.
    await tx.conversation.updateMany({ where: { tenantId, phoneHash: { in: conversas }, patientId: null }, data: { patientId: patient.id } });
    if (!lead) return null;
    const ligado = await tx.lead.update({ where: { id: lead.id, tenantId }, data: { patientId: patient.id, name: patient.name } });
    await tx.leadActivity.create({
      data: { tenantId, leadId: lead.id, type: 'CONVERTED', actorId: null, data: { patientId: patient.id, how: 'auto' } },
    });
    await tx.conversation.updateMany({ where: { tenantId, leadId: lead.id }, data: { patientId: patient.id } });
    return ligado;
  });
}
