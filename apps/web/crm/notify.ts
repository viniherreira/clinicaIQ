import 'server-only';

import { getTenantClient, type Prisma } from '@clinicaiq/db';
import { getTenantModules } from '@/lib/access';
import { planForEvent, type ClinicEvent } from './automation';
import { clinicDateAt, clinicNowWall } from './clock';
import { moveLead, OPEN_LEAD } from './leads';
import { createTask } from './tasks';

export type { ClinicEvent } from './automation';

/**
 * O aviso que a agenda e os orçamentos mandam ao CRM.
 *
 * É o único ponto do CRM que o resto do sistema importa, e é chamado dentro de
 * `after()`, depois que a ação da clínica já gravou:
 *
 *   after(() => notifyCrm(tenantId, { type: 'appointment.created', ... }));
 *
 * Promessas que este arquivo cumpre:
 * - nunca lança: qualquer falha vira um log sem dado pessoal, e o agendamento
 *   ou o orçamento continuam salvos;
 * - clínica sem o CRM não paga nem uma consulta além de checar o módulo;
 * - sem lead do paciente, não faz nada.
 */
export async function notifyCrm(tenantId: string, event: ClinicEvent): Promise<void> {
  try {
    const modules = await getTenantModules(tenantId);
    if (!modules.crm) return;
    await applyEvent(tenantId, event);
  } catch (error) {
    console.error('[crm] aviso da clínica falhou', {
      event: event.type,
      tenantId,
      patientId: event.patientId,
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
  }
}

const QUOTE_OPEN = ['DRAFT', 'SENT', 'VIEWED'] as const;

async function applyEvent(tenantId: string, event: ClinicEvent) {
  const db = getTenantClient(tenantId);
  const refId = 'appointmentId' in event ? event.appointmentId : event.quoteId;
  const ref = 'appointmentId' in event ? { appointmentId: refId } : { quoteId: refId };

  // Qual lead: o aberto mais recente do paciente. Na reabertura de orçamento,
  // o lead que esse orçamento ganhou (que já não está aberto).
  let lead;
  let wonByThisQuote = false;
  if (event.type === 'quote.reopened') {
    const ganhoPorEste = await db.leadActivity.findFirst({
      where: {
        type: 'STAGE_CHANGED',
        AND: [
          { data: { path: ['event'], equals: 'quote.accepted' } },
          { data: { path: ['quoteId'], equals: event.quoteId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { leadId: true },
    });
    if (!ganhoPorEste) return;
    lead = await db.lead.findFirst({ where: { id: ganhoPorEste.leadId, patientId: event.patientId, deletedAt: null } });
    wonByThisQuote = Boolean(lead);
  } else {
    lead = await db.lead.findFirst({
      where: { patientId: event.patientId, ...OPEN_LEAD },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!lead) return;

  const [stages, futuros, orcamentosAbertos] = await Promise.all([
    db.pipelineStage.findMany(),
    db.appointment.count({
      where: {
        patientId: event.patientId,
        startTime: { gt: clinicNowWall() },
        status: { notIn: ['CANCELLED', 'MISSED'] },
        ...('appointmentId' in event ? { id: { not: event.appointmentId } } : {}),
      },
    }),
    db.quote.count({
      where: {
        patientId: event.patientId,
        status: { in: [...QUOTE_OPEN] },
        ...('quoteId' in event ? { id: { not: event.quoteId } } : {}),
      },
    }),
  ]);

  const plan = planForEvent(
    {
      stages,
      lead,
      hasFutureAppointment: futuros > 0,
      hasOpenQuote: orcamentosAbertos > 0,
      wonByThisQuote,
    },
    event,
  );

  const automacao = { tenantId, userId: null };

  // O evento entra no histórico do lead sempre — mesmo quando nada se move,
  // a recepção vê na linha do tempo o que aconteceu na agenda.
  await db.leadActivity.create({
    data: {
      tenantId,
      leadId: lead.id,
      type: 'CLINIC_EVENT',
      actorId: null,
      data: {
        event: event.type,
        ...ref,
        ...(event.type === 'quote.rejected' && event.reason ? { reason: event.reason.slice(0, 500) } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  if (plan.moveTo && plan.moveTo !== lead.stageId) {
    await moveLead(db, automacao, lead.id, { stageId: plan.moveTo, origin: { event: event.type, ...ref } });
  }

  if (plan.wonValueCents !== undefined) {
    await db.lead.update({ where: { id: lead.id, tenantId }, data: { estimatedValueCents: plan.wonValueCents } });
  }

  if (plan.tasks.length > 0) {
    const responsavel = lead.assignedToId ?? (await fallbackAssignee(db));
    if (!responsavel) return;
    for (const task of plan.tasks) {
      // Não repete: cancelar duas vezes não cria duas "Reagendar avaliação".
      const jaExiste = await db.leadTask.count({
        where: { leadId: lead.id, text: task.text, origin: 'AUTOMATION', completedAt: null },
      });
      if (jaExiste) continue;
      await createTask(db, automacao, lead.id, {
        text: task.text,
        dueAt: clinicDateAt(task.inDays, 10),
        assignedToId: responsavel,
        origin: 'AUTOMATION',
      });
    }
  }
}

/** Lead sem responsável: a tarefa vai para o dono (ou um admin) da clínica. */
async function fallbackAssignee(db: ReturnType<typeof getTenantClient>): Promise<string | null> {
  const pessoa = await db.user.findFirst({
    where: { active: true, role: { in: ['OWNER', 'ADMIN'] } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return pessoa?.id ?? null;
}
