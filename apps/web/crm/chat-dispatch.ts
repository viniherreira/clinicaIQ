import 'server-only';

import { getTenantClient } from '@clinicaiq/db';
import { getGatewayProvider } from '@clinicaiq/whatsapp';
import { activeCloudAccount } from './cloud';
import { sendViaCloud } from './cloud-send';
import { simulateSent } from './conversations';

/**
 * Entrega uma mensagem já gravada pelo canal da clínica. Chamado depois de
 * responder à tela (`after`), então nunca segura quem está digitando. Se
 * falhar, a fila tenta de novo sozinha (o gateway no QR, o relógio do CRM na
 * API oficial).
 *
 * Sem nenhum canal configurado (desenvolvimento), a mensagem é dada como enviada.
 */
export async function dispatchChat(tenantId: string, chatMessageId: string): Promise<void> {
  const cloud = await activeCloudAccount(tenantId);
  if (cloud) {
    await sendViaCloud(cloud, chatMessageId);
    return;
  }
  const gateway = getGatewayProvider(tenantId);
  if (gateway) {
    await gateway.sendChat(chatMessageId);
    return;
  }
  if (process.env.NODE_ENV !== 'production') await simulateSent(getTenantClient(tenantId), chatMessageId);
}
