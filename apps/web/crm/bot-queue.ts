import type { TenantPrismaClient } from '@clinicaiq/db';
import { readFlow } from './flow-legacy';

type Db = TenantPrismaClient | Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

/** O passo especial que diz "começar este robô na próxima volta do relógio". */
export const START_PENDING = '__start__';

/**
 * Gatilhos do Kommo que não vêm de uma mensagem: o lead entrou numa etapa ou
 * ganhou uma tag. Marca a conversa do lead para o robô começar (o relógio do
 * CRM começa em até um minuto — `wakeBots`). Não interrompe um robô que já
 * está conversando, e sem conversa de WhatsApp não há com quem falar.
 *
 * Módulo à parte (sem as conversas) para `leads.ts` e `stage-queue.ts` poderem
 * chamar dentro da transação.
 */
export async function queueTriggeredBot(
  db: Db,
  tenantId: string,
  leadId: string,
  event: { stageId: string } | { tagIds: string[] },
  now: Date = new Date(),
): Promise<string | null> {
  const trigger = 'stageId' in event ? 'STAGE' : 'TAG';
  const flows = await db.chatbotFlow.findMany({ where: { tenantId, active: true, trigger }, orderBy: { createdAt: 'asc' }, select: { id: true, steps: true } });
  const flow = flows.find((f) => {
    const cfg = readFlow(f.steps)?.trigger;
    return 'stageId' in event ? Boolean(cfg?.stageIds?.includes(event.stageId)) : event.tagIds.some((t) => cfg?.tagIds?.includes(t));
  });
  if (!flow) return null;
  const conv = await db.conversation.findFirst({
    where: { tenantId, leadId, status: { not: 'DECLINED' }, botFlowId: null },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true },
  });
  if (!conv) return null;
  await db.conversation.updateMany({
    where: { id: conv.id, tenantId, botFlowId: null },
    data: { botFlowId: flow.id, botStepId: START_PENDING, botStartedAt: now, botMisses: 0, botWakeAt: now },
  });
  return flow.id;
}
