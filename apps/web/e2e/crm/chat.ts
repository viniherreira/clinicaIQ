import { encrypt, hashForTenant, prisma } from '@clinicaiq/db';
import { chatKey } from '../../lib/phone';
import { required } from '../support/env';
import { E2E_TENANT_SLUG } from '../support/seed';

let seq = 0;

/**
 * Uma mensagem chegando no WhatsApp da clínica, gravada como o gateway grava:
 * conversa sem classificar e a mensagem do contato, cifradas. O app liga a
 * conversa ao lead ou ao paciente quando alguém abre o funil ou as Conversas.
 */
export async function incomingMessage(phone: string, contactName: string, text: string) {
  const key = required('ENCRYPTION_MASTER_KEY');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG }, select: { id: true } });
  const k = chatKey(phone);
  const phoneHash = hashForTenant(k, key, tenant.id);
  const now = new Date();
  const conv =
    (await prisma.conversation.findFirst({ where: { tenantId: tenant.id, phoneHash } })) ??
    (await prisma.conversation.create({
      data: { tenantId: tenant.id, phoneHash, phoneEncrypted: encrypt(k, key, tenant.id), contactName },
    }));
  await prisma.chatMessage.create({
    data: {
      tenantId: tenant.id,
      conversationId: conv.id,
      direction: 'INBOUND',
      origin: 'CONTACT',
      textEncrypted: encrypt(text, key, tenant.id),
      externalId: `E2E${Date.now()}${seq++}${Math.random().toString(36).slice(2, 6)}`,
      at: now,
    },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      lastMessageAt: now,
      lastPreviewEncrypted: encrypt(text, key, tenant.id),
      unreadCount: { increment: 1 },
      awaitingReply: true,
    },
  });
  return conv.id;
}
