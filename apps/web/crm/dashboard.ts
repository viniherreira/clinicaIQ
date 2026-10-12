import 'server-only';

import type { CrmContext } from './guard';
import { OPEN_LEAD } from './leads';
import { SOURCE_LABEL } from './format';
import type { BoardPerson, BoardStage } from './types';
import {
  conversionRate,
  countBy,
  medianFirstResponseMinutes,
  periodStart,
  type PeriodKey,
} from './dashboard-math';

/** Até quantas mensagens o tempo de resposta lê: o bastante para a mediana, sem pesar. */
const RESPONSE_SAMPLE = 5000;

export interface DashboardData {
  from: string;
  kpis: {
    newLeads: number;
    won: number;
    wonValueCents: number;
    lost: number;
    conversion: number | null;
    openLeads: number;
    openValueCents: number;
    overdueTasks: number;
    awaitingReply: number;
    responseMinutes: number | null;
  };
  funnel: { id: string; name: string; color: string; count: number; valueCents: number }[];
  sources: { label: string; count: number }[];
  lostReasons: { label: string; count: number }[];
  team: { id: string; name: string; open: number; won: number; wonValueCents: number; overdue: number }[];
}

/**
 * O Painel do CRM: o que entrou, o que fechou e como a equipe está, no período.
 * Tudo lido na hora — nada é guardado à parte.
 */
export async function loadDashboard(
  ctx: CrmContext,
  period: PeriodKey,
  stages: BoardStage[],
  team: BoardPerson[],
  now: Date = new Date(),
): Promise<DashboardData> {
  const from = periodStart(period, now);
  const noPeriodo = { gte: from, lte: now };

  const [abertos, novos, ganhos, perdidos, atrasadas, semResposta, mensagens] = await Promise.all([
    ctx.db.lead.findMany({ where: OPEN_LEAD, select: { stageId: true, estimatedValueCents: true, assignedToId: true } }),
    ctx.db.lead.findMany({ where: { deletedAt: null, createdAt: noPeriodo }, select: { source: true } }),
    ctx.db.lead.findMany({
      where: { deletedAt: null, wonAt: noPeriodo },
      select: { estimatedValueCents: true, assignedToId: true },
    }),
    ctx.db.lead.findMany({
      where: { deletedAt: null, lostAt: noPeriodo },
      select: { lostReason: { select: { name: true } } },
    }),
    ctx.db.leadTask.findMany({
      where: { completedAt: null, dueAt: { lt: now }, lead: OPEN_LEAD },
      select: { assignedToId: true },
    }),
    ctx.db.conversation.count({ where: { status: { not: 'DECLINED' }, awaitingReply: true } }),
    ctx.db.chatMessage.findMany({
      where: { at: noPeriodo },
      select: { conversationId: true, direction: true, origin: true, at: true },
      orderBy: { at: 'desc' },
      take: RESPONSE_SAMPLE,
    }),
  ]);

  const soma = (ls: { estimatedValueCents: number | null }[]) => ls.reduce((s, l) => s + (l.estimatedValueCents ?? 0), 0);

  const funnel = stages.map((s) => {
    const daEtapa = abertos.filter((l) => l.stageId === s.id);
    return { id: s.id, name: s.name, color: s.color, count: daEtapa.length, valueCents: soma(daEtapa) };
  });

  const equipe = team
    .map((p) => {
      const deles = ganhos.filter((l) => l.assignedToId === p.id);
      return {
        id: p.id,
        name: p.name,
        open: abertos.filter((l) => l.assignedToId === p.id).length,
        won: deles.length,
        wonValueCents: soma(deles),
        overdue: atrasadas.filter((t) => t.assignedToId === p.id).length,
      };
    })
    .filter((p) => p.open || p.won || p.overdue)
    .sort((a, b) => b.wonValueCents - a.wonValueCents || b.open - a.open);

  return {
    from: from.toISOString(),
    kpis: {
      newLeads: novos.length,
      won: ganhos.length,
      wonValueCents: soma(ganhos),
      lost: perdidos.length,
      conversion: conversionRate(ganhos.length, perdidos.length),
      openLeads: abertos.length,
      openValueCents: soma(abertos),
      overdueTasks: atrasadas.length,
      awaitingReply: semResposta,
      responseMinutes: medianFirstResponseMinutes(mensagens),
    },
    funnel,
    sources: countBy(novos, (l) => SOURCE_LABEL[l.source] ?? l.source).map((c) => ({ label: c.key, count: c.count })),
    lostReasons: countBy(perdidos, (l) => l.lostReason?.name ?? 'Sem motivo').map((c) => ({ label: c.key, count: c.count })),
    team: equipe,
  };
}
