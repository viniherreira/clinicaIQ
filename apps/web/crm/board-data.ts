import 'server-only';

import type { LeadSource, Prisma } from '@clinicaiq/db';
import type { CrmContext } from './guard';
import { OPEN_LEAD } from './leads';
import { liveInfoForLeads } from './live';
import { canonicalPhone, decryptPhone, maskPhone, phoneHash } from './phone';
import { taskStatus } from './tasks-status';
import type { BoardFilters, BoardLead, BoardTaskStatus } from './types';

const SOURCES: readonly LeadSource[] = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'];

/** Lê os filtros da URL, sem confiar em nada que venha dela. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): BoardFilters {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const tarefa = one('tarefa');
  const origem = one('origem');
  return {
    q: one('q').trim().slice(0, 80),
    resp: one('resp') || 'all',
    tarefa: tarefa === 'none' || tarefa === 'overdue' ? tarefa : '',
    tag: one('tag'),
    origem: (SOURCES as readonly string[]).includes(origem) ? origem : '',
  };
}

/** A parte do filtro que o banco resolve. Situação de tarefa é filtrada depois. */
export function leadWhere(ctx: Pick<CrmContext, 'tenantId' | 'userId'>, f: BoardFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { deletedAt: null };
  if (f.resp === 'me') where.assignedToId = ctx.userId;
  else if (f.resp !== 'all') where.assignedToId = f.resp;
  if (f.tag) where.tags = { some: { tagId: f.tag } };
  if (f.origem) where.source = f.origem as LeadSource;
  if (f.q) {
    const digits = f.q.replace(/\D/g, '');
    // Com DDD e número, procura pelo telefone (índice cego); senão, pelo nome.
    where.OR =
      digits.length >= 10
        ? [{ phoneHash: phoneHash(canonicalPhone(digits), ctx.tenantId) }]
        : [{ name: { contains: f.q, mode: 'insensitive' } }, { title: { contains: f.q, mode: 'insensitive' } }];
  }
  return where;
}

const leadInclude = {
  tags: { include: { tag: true } },
  assignedTo: { select: { id: true, name: true } },
  interestProcedure: { select: { name: true } },
  tasks: { where: { completedAt: null }, select: { dueAt: true, completedAt: true } },
} satisfies Prisma.LeadInclude;

type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

function toTaskStatus(row: LeadRow, now: Date): BoardTaskStatus {
  const s = taskStatus(row.tasks, now);
  if (s.kind === 'none') return s;
  if (s.kind === 'overdue') return { kind: 'overdue', dueAt: s.dueAt.toISOString(), count: s.count };
  return { kind: 'upcoming', dueAt: s.dueAt.toISOString() };
}

export async function toBoardLeads(ctx: CrmContext, rows: LeadRow[], now: Date = new Date()): Promise<BoardLead[]> {
  const live = await liveInfoForLeads(ctx.db, rows, now);
  return rows.map((r) => {
    const info = live.get(r.id);
    return {
      id: r.id,
      stageId: r.stageId,
      title: r.title,
      name: r.name,
      phoneMasked: maskPhone(decryptPhone(r.phoneEncrypted, ctx.tenantId)),
      source: r.source,
      interest: r.interestProcedure?.name ?? null,
      valueCents: info?.openQuote?.totalCents ?? r.estimatedValueCents,
      tags: r.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
      assignee: r.assignedTo,
      task: toTaskStatus(r, now),
      stageEnteredAt: r.stageEnteredAt.toISOString(),
      nextAppointment: info?.nextAppointment
        ? { startTime: info.nextAppointment.startTime.toISOString(), professionalName: info.nextAppointment.professionalName }
        : null,
      openQuote: info?.openQuote ? { number: info.openQuote.number, totalCents: info.openQuote.totalCents } : null,
      wonAt: r.wonAt?.toISOString() ?? null,
      lostAt: r.lostAt?.toISOString() ?? null,
    };
  });
}

/** Os leads abertos do quadro, com os filtros aplicados. */
export async function loadBoardLeads(ctx: CrmContext, f: BoardFilters, now: Date = new Date()) {
  const rows = await ctx.db.lead.findMany({
    where: { ...leadWhere(ctx, f), ...OPEN_LEAD },
    include: leadInclude,
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    take: 1000,
  });
  const leads = await toBoardLeads(ctx, rows, now);
  return f.tarefa ? leads.filter((l) => l.task.kind === f.tarefa) : leads;
}

export { leadInclude };

export type ListStatus = 'abertos' | 'ganhos' | 'perdidos' | 'todos';
export type ListOrder = 'recentes' | 'nome' | 'valor' | 'etapa';

/** A lista: os mesmos filtros do quadro, mais a situação (ganhos, perdidos) e a ordem. */
export async function loadLeadList(
  ctx: CrmContext,
  f: BoardFilters,
  status: ListStatus,
  order: ListOrder,
  now: Date = new Date(),
) {
  const situacao: Prisma.LeadWhereInput =
    status === 'abertos'
      ? OPEN_LEAD
      : status === 'ganhos'
        ? { wonAt: { not: null } }
        : status === 'perdidos'
          ? { lostAt: { not: null } }
          : {};
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    order === 'nome'
      ? [{ name: 'asc' }]
      : order === 'valor'
        ? [{ estimatedValueCents: { sort: 'desc', nulls: 'last' } }]
        : order === 'etapa'
          ? [{ stage: { order: 'asc' } }, { position: 'asc' }]
          : [{ createdAt: 'desc' }];

  const rows = await ctx.db.lead.findMany({
    where: { ...leadWhere(ctx, f), ...situacao },
    include: { ...leadInclude, stage: { select: { name: true } } },
    orderBy,
    take: 500,
  });
  const leads = await toBoardLeads(ctx, rows, now);
  const stageName = new Map(rows.map((r) => [r.id, r.stage.name]));
  const createdAt = new Map(rows.map((r) => [r.id, r.createdAt.toISOString()]));
  const list = leads.map((l) => ({ ...l, stageName: stageName.get(l.id) ?? '', createdAt: createdAt.get(l.id) ?? '' }));
  return f.tarefa ? list.filter((l) => l.task.kind === f.tarefa) : list;
}

export function parseListParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const status = (['abertos', 'ganhos', 'perdidos', 'todos'] as const).find((s) => s === one('situacao')) ?? 'abertos';
  const order = (['recentes', 'nome', 'valor', 'etapa'] as const).find((s) => s === one('ordem')) ?? 'recentes';
  return { status, order };
}
