import type { TenantPrismaClient } from '@clinicaiq/db';

type Tx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

/**
 * O lead entrou numa etapa: agenda as automações dela (`crm/stage-automations.ts`).
 * Chamada dentro da mesma transação que muda a etapa (`createLead`, `moveLead`).
 * Módulo à parte para `leads.ts` não depender das conversas.
 */
export async function queueStageAutomations(
  tx: Tx,
  tenantId: string,
  leadId: string,
  stageId: string,
  enteredAt: Date,
): Promise<number> {
  // Saiu da etapa: o que estava agendado para a anterior não roda mais.
  await tx.automationRun.updateMany({
    where: { tenantId, leadId, status: 'PENDING', doneAt: null, automation: { stageId: { not: stageId } } },
    data: { status: 'SKIPPED', error: 'O lead saiu da etapa antes da hora.', doneAt: enteredAt },
  });
  const autos = await tx.stageAutomation.findMany({ where: { tenantId, stageId, active: true }, select: { id: true, delayMinutes: true } });
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
