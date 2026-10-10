import 'server-only';

import { getTenantClient } from '@clinicaiq/db';
import { getGatewayProvider } from '@clinicaiq/whatsapp';
import { simulateSent } from './conversations';

/**
 * Entrega ao gateway uma resposta já gravada. Chamado depois de responder à
 * tela (`after`), então nunca segura quem está digitando. Se falhar, o gateway
 * tenta de novo sozinho.
 *
 * Sem gateway configurado (desenvolvimento), a mensagem é dada como enviada.
 */
export async function dispatchChat(tenantId: string, chatMessageId: string): Promise<void> {
  const gateway = getGatewayProvider(tenantId);
  if (gateway) {
    await gateway.sendChat(chatMessageId);
    return;
  }
  if (process.env.NODE_ENV !== 'production') await simulateSent(getTenantClient(tenantId), chatMessageId);
}
