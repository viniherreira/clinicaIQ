import 'server-only';

import type { CrmContext } from './guard';
import { liveInfoForLeads } from './live';
import { decryptPhone, maskPhone } from './phone';
import { taskStatus } from './tasks-status';
import { toTimeline, type TimelineEntry } from './timeline';
import type { BoardTag, BoardTaskStatus } from './types';

export interface LeadDetail {
  id: string;
  title: string | null;
  name: string;
  phoneMasked: string;
  email: string | null;
  source: string;
  stageId: string;
  stageEnteredAt: string;
  interestProcedureId: string | null;
  valueCents: number | null;
  assignedToId: string | null;
  tags: BoardTag[];
  patient: { id: string; name: string; controlNumber: number } | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  task: BoardTaskStatus;
  pendingTasks: { id: string; text: string; dueAt: string; assignee: string; overdue: boolean }[];
  timeline: TimelineEntry[];
  otherDeals: { id: string; label: string; status: string }[];
  nextAppointment: { startTime: string; professionalName: string } | null;
  openQuote: { id: string; number: number; totalCents: number } | null;
}

export async function loadLeadDetail(ctx: CrmContext, leadId: string, now: Date = new Date()): Promise<LeadDetail | null> {
  const lead = await ctx.db.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    include: {
      tags: { include: { tag: true } },
      patient: { select: { id: true, name: true, controlNumber: true } },
      lostReason: { select: { name: true } },
      tasks: { where: { completedAt: null }, orderBy: { dueAt: 'asc' }, include: { assignedTo: { select: { name: true } } } },
      activities: { orderBy: { createdAt: 'asc' }, take: 300 },
    },
  });
  if (!lead) return null;

  const [stages, tags, people, reasons, outros, live] = await Promise.all([
    ctx.db.pipelineStage.findMany({ select: { id: true, name: true, role: true } }),
    ctx.db.leadTag.findMany({ select: { id: true, name: true } }),
    ctx.db.user.findMany({ select: { id: true, name: true } }),
    ctx.db.lostReason.findMany({ select: { id: true, name: true } }),
    // Outros negócios da mesma pessoa: pela ficha de paciente, ou pelo telefone.
    ctx.db.lead.findMany({
      where: {
        id: { not: lead.id },
        deletedAt: null,
        OR: [{ phoneHash: lead.phoneHash }, ...(lead.patientId ? [{ patientId: lead.patientId }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, title: true, name: true, wonAt: true, lostAt: true, stage: { select: { name: true } } },
    }),
    liveInfoForLeads(ctx.db, [lead], now),
  ]);

  const info = live.get(lead.id);
  const status = taskStatus(lead.tasks, now);
  const timeline = toTimeline(lead.activities, {
    stages: new Map(stages.map((s) => [s.id, s.name])),
    tags: new Map(tags.map((t) => [t.id, t.name])),
    people: new Map(people.map((p) => [p.id, p.name])),
    reasons: new Map(reasons.map((r) => [r.id, r.name])),
    wonStageId: stages.find((s) => s.role === 'WON')?.id ?? null,
  });

  return {
    id: lead.id,
    title: lead.title,
    name: lead.name,
    phoneMasked: maskPhone(decryptPhone(lead.phoneEncrypted, ctx.tenantId)),
    email: lead.email,
    source: lead.source,
    stageId: lead.stageId,
    stageEnteredAt: lead.stageEnteredAt.toISOString(),
    interestProcedureId: lead.interestProcedureId,
    valueCents: lead.estimatedValueCents,
    assignedToId: lead.assignedToId,
    tags: lead.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    patient: lead.patient,
    wonAt: lead.wonAt?.toISOString() ?? null,
    lostAt: lead.lostAt?.toISOString() ?? null,
    lostReason: lead.lostReason?.name ?? null,
    task:
      status.kind === 'none'
        ? status
        : status.kind === 'overdue'
          ? { kind: 'overdue', dueAt: status.dueAt.toISOString(), count: status.count }
          : { kind: 'upcoming', dueAt: status.dueAt.toISOString() },
    pendingTasks: lead.tasks.map((t) => ({
      id: t.id,
      text: t.text,
      dueAt: t.dueAt.toISOString(),
      assignee: t.assignedTo.name,
      overdue: t.dueAt.getTime() < now.getTime(),
    })),
    timeline,
    otherDeals: outros.map((o) => ({
      id: o.id,
      label: o.title || o.name,
      status: o.wonAt ? 'Fechou' : o.lostAt ? 'Perdeu' : o.stage.name,
    })),
    nextAppointment: info?.nextAppointment
      ? { startTime: info.nextAppointment.startTime.toISOString(), professionalName: info.nextAppointment.professionalName }
      : null,
    openQuote: info?.openQuote ?? null,
  };
}
