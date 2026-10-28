import type { TenantPrismaClient } from '@clinicaiq/db';
import { queueTriggeredBot } from './bot-queue';
import { hasConditions, matchesConditions, parseConditions, triggerMatches, type StageTriggerKind } from './stage-automation-rules';

type Tx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

/**
 * O lead entrou numa etapa: agenda as automações dela (`crm/stage-automations.ts`).
 * Chamada dentro da mesma transação que muda a etapa (`createLead`, `moveLead`).
 * Só as que valem para o jeito de entrar (criado ou movido) e cujas condições
 * (dia, horário, origem, tag) batem agora. Módulo à parte para `leads.ts` não
 * depender das conversas.
 */
export async function queueStageAutomations(
  tx: Tx,
  tenantId: string,
  leadId: string,
  stageId: string,
  enteredAt: Date,
  kind: 'created' | 'moved' = 'moved',
): Promise<number> {
  // Saiu da etapa: o que estava agendado para a anterior não roda mais.
  await tx.automationRun.updateMany({
    where: { tenantId, leadId, status: 'PENDING', doneAt: null, automation: { stageId: { not: stageId } } },
    data: { status: 'SKIPPED', error: 'O lead saiu da etapa antes da hora.', doneAt: enteredAt },
  });
  // Robô com gatilho "lead entra nesta etapa" (Salesbot do Kommo).
  await queueTriggeredBot(tx, tenantId, leadId, { stageId }, enteredAt);
  const todas = await tx.stageAutomation.findMany({
    where: { tenantId, stageId, active: true },
    select: { id: true, delayMinutes: true, trigger: true, conditions: true },
  });
  const doGatilho = todas
    .filter((a) => triggerMatches(a.trigger as StageTriggerKind, kind))
    .map((a) => ({ ...a, cond: parseConditions(a.conditions) }));
  // Origem e tags do lead, só se alguma automação perguntar.
  const lead = doGatilho.some((a) => hasConditions(a.cond))
    ? await tx.lead.findFirst({ where: { id: leadId, tenantId }, select: { source: true, tags: { select: { tagId: true } } } })
    : null;
  const info = { source: lead?.source ?? '', tagIds: lead?.tags.map((t) => t.tagId) ?? [] };
  const autos = doGatilho.filter((a) => !hasConditions(a.cond) || matchesConditions(a.cond, info, enteredAt));
  if (autos.length === 0) return 0;
  await tx.automationRun.createMany({
    data: autos.map((a) => ({
      tenantId,
      automationId: a.id,
      leadId,
      stageEnteredAt: enteredAt,
      dueAt: new Date(enteredAt.getTime() + a.delayMinutes * 60_000),
    })),
  });
  return autos.length;
}
