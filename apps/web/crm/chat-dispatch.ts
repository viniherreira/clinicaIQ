import { getTenantClient } from '@clinicaiq/db';
import { activeCloudAccount } from './cloud';
import { sendViaCloud } from './cloud-send';
import { failNoChannel, simulateSent } from './conversations';

/**
 * Entrega uma mensagem já gravada pelo canal da clínica, a API oficial.
 * Chamado depois de responder à tela (`after`), então nunca segura quem está
 * digitando. Se a Meta falhar de passagem, o relógio do CRM tenta de novo.
 *
 * Sem a API oficial ligada: em produção a mensagem fica "não enviada", com o
 * motivo; no desenvolvimento ela é dada como enviada.
 */
export async function dispatchChat(tenantId: string, chatMessageId: string): Promise<void> {
  const cloud = await activeCloudAccount(tenantId);
  if (cloud) {
    await sendViaCloud(cloud, chatMessageId);
    return;
  }
  const db = getTenantClient(tenantId);
  if (process.env.NODE_ENV === 'production') await failNoChannel(db, chatMessageId);
  else await simulateSent(db, chatMessageId);
}
