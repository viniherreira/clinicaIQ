import 'server-only';

import type { CrmContext } from './guard';
import { CLINIC_TZ } from '@/lib/tz';

export interface TaskRow {
  id: string;
  text: string;
  dueAt: string;
  leadId: string;
  leadLabel: string;
  assignee: string;
  automatic: boolean;
}

export interface TaskGroups {
  atrasadas: TaskRow[];
  hoje: TaskRow[];
  proximas: TaskRow[];
}

const diaDaClinica = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(d);

/** Separa pelo relógio da clínica: venceu, vence hoje, vence depois. */
export function groupTasks(rows: TaskRow[], now: Date = new Date()): TaskGroups {
  const hoje = diaDaClinica(now);
  const g: TaskGroups = { atrasadas: [], hoje: [], proximas: [] };
  for (const r of rows) {
    const due = new Date(r.dueAt);
    if (due.getTime() < now.getTime()) g.atrasadas.push(r);
    else if (diaDaClinica(due) === hoje) g.hoje.push(r);
    else g.proximas.push(r);
  }
  return g;
}

/** Tarefas pendentes de leads abertos, de uma pessoa ou de todas. */
export async function loadTasks(ctx: CrmContext, who: 'me' | 'all' | string, now: Date = new Date()) {
  const tasks = await ctx.db.leadTask.findMany({
    where: {
      completedAt: null,
      lead: { deletedAt: null, wonAt: null, lostAt: null },
      ...(who === 'all' ? {} : { assignedToId: who === 'me' ? ctx.userId : who }),
    },
    orderBy: { dueAt: 'asc' },
    take: 500,
    include: {
      lead: { select: { id: true, title: true, name: true } },
      assignedTo: { select: { name: true } },
    },
  });
  return groupTasks(
    tasks.map((t) => ({
      id: t.id,
      text: t.text,
      dueAt: t.dueAt.toISOString(),
      leadId: t.lead.id,
      leadLabel: t.lead.title ? `${t.lead.title} · ${t.lead.name}` : t.lead.name,
      assignee: t.assignedTo.name,
      automatic: t.origin === 'AUTOMATION',
    })),
    now,
  );
}
