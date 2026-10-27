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

/** Como no Kommo: o que venceu, hoje, amanhã, o resto da semana e depois. */
export interface TaskGroups {
  atrasadas: TaskRow[];
  hoje: TaskRow[];
  amanha: TaskRow[];
  semana: TaskRow[];
  depois: TaskRow[];
}

const diaDaClinica = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(d);

/** O dia da clínica (aaaa-mm-dd) daqui a `n` dias. */
const diaMais = (now: Date, n: number) => diaDaClinica(new Date(now.getTime() + n * 86_400_000));

/** Separa pelo relógio da clínica: venceu, hoje, amanhã, nos próximos 7 dias, depois. */
export function groupTasks(rows: TaskRow[], now: Date = new Date()): TaskGroups {
  const hoje = diaDaClinica(now);
  const amanha = diaMais(now, 1);
  const fimDaSemana = diaMais(now, 7);
  const g: TaskGroups = { atrasadas: [], hoje: [], amanha: [], semana: [], depois: [] };
  for (const r of rows) {
    const due = new Date(r.dueAt);
    const dia = diaDaClinica(due);
    if (due.getTime() < now.getTime()) g.atrasadas.push(r);
    else if (dia === hoje) g.hoje.push(r);
    else if (dia === amanha) g.amanha.push(r);
    else if (dia <= fimDaSemana) g.semana.push(r);
    else g.depois.push(r);
  }
  return g;
}

/** Tarefas pendentes de leads abertos, de uma pessoa ou de todas. */
export async function loadTasks(ctx: CrmContext, who: 'me' | 'all' | string, now: Date = new Date()) {
  const tasks = await ctx.db.leadTask.findMany({
    where: {
      completedAt: null,
      lead: { deletedAt: null, wonAt: null, lostAt: null },
      // Atendente "só os dele": só as tarefas dele, qualquer que seja o filtro.
      ...(who === 'all' && !ctx.ownOnly ? {} : { assignedToId: who === 'me' || ctx.ownOnly ? ctx.userId : who }),
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
