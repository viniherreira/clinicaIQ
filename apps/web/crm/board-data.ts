import 'server-only';

import type { LeadSource, Prisma } from '@clinicaiq/db';
import type { CrmContext } from './guard';
import { OPEN_LEAD } from './leads';
import { liveInfoForLeads, openQuotesByPatient } from './live';
import { canonicalPhone, decryptPhone, maskPhone, phoneHashes } from './phone';
import { taskStatus } from './tasks-status';
import type { BoardFilters, BoardLead, BoardTaskStatus } from './types';
import { clinicDay, hasPeriod, periodWhere } from './period';

export { parseFilters } from './filters';
import { anyFieldWhere, formatFieldValue, readFieldValues } from './custom-fields';
import { leadScope } from './scope-rules';

/**
 * O filtro inteiro, resolvido no banco. `now` decide "hoje" (para os atalhos
 * do período) e "atrasada" (para as tarefas).
 */
export function leadWhere(
  ctx: Pick<CrmContext, 'tenantId' | 'userId'> & { ownOnly?: boolean },
  f: BoardFilters,
  now: Date = new Date(),
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { deletedAt: null };
  // Período, tarefa e busca usam OR/some por dentro; juntos, cada um no seu AND.
  const and: Prisma.LeadWhereInput[] = [];
  // Atendente "só os dele": os seus e os sem responsável, qualquer que seja o filtro.
  const escopo = leadScope(ctx);
  if (escopo) and.push(escopo);
  if (f.resp === 'me') where.assignedToId = ctx.userId;
  else if (f.resp !== 'all') where.assignedToId = f.resp;
  if (f.tags.length) where.tags = { some: { tagId: { in: f.tags } } };
  if (f.origem) where.source = f.origem as LeadSource;
  if (f.etapa) where.stageId = f.etapa;
  else if (f.funil) where.stage = { pipelineId: f.funil };
  const periodo = periodWhere(f.periodo, clinicDay(now));
  if (periodo) and.push(periodo);
  // As mesmas regras de `taskStatus`: sem tarefa aberta; ou alguma aberta já vencida.
  if (f.tarefa === 'none') and.push({ tasks: { none: { completedAt: null } } });
  if (f.tarefa === 'overdue') and.push({ tasks: { some: { completedAt: null, dueAt: { lt: now } } } });
  for (const c of f.campos) and.push(anyFieldWhere(c));
  if (f.valorMin != null || f.valorMax != null) {
    where.estimatedValueCents = {
      ...(f.valorMin != null ? { gte: Math.round(f.valorMin * 100) } : {}),
      ...(f.valorMax != null ? { lte: Math.round(f.valorMax * 100) } : {}),
    };
  }
  if (f.q) {
    const digits = f.q.replace(/\D/g, '');
    // Com DDD e número, procura pelo telefone (índice cego); senão, pelo nome.
    and.push({
      OR:
        digits.length >= 10
          ? [{ phoneHash: { in: phoneHashes(canonicalPhone(digits), ctx.tenantId) } }]
          : [{ name: { contains: f.q, mode: 'insensitive' } }, { title: { contains: f.q, mode: 'insensitive' } }],
    });
  }
  if (and.length) where.AND = and;
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
  const [live, noCard] = await Promise.all([
    liveInfoForLeads(ctx.db, rows, now),
    ctx.db.leadField.findMany({ where: { active: true, showOnCard: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], take: 3 }),
  ]);
  return rows.map((r) => {
    const info = live.get(r.id);
    const fields = readFieldValues(r.fields);
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
      createdAt: r.createdAt.toISOString(),
      nextAppointment: info?.nextAppointment
        ? { startTime: info.nextAppointment.startTime.toISOString(), professionalName: info.nextAppointment.professionalName }
        : null,
      openQuote: info?.openQuote ? { number: info.openQuote.number, totalCents: info.openQuote.totalCents } : null,
      wonAt: r.wonAt?.toISOString() ?? null,
      lostAt: r.lostAt?.toISOString() ?? null,
      fields,
      cardFields: noCard.flatMap((d) => {
        const value = formatFieldValue(d, fields[d.id]);
        return value ? [{ name: d.name, value }] : [];
      }),
    };
  });
}

/** Quantos cards cada coluna do quadro carrega por vez; rolando até o fim, vêm mais. */
export const BOARD_PAGE = 50;
/** A lista mostra de 100 em 100 (`pagina=`). */
export const LIST_PAGE_SIZE = 100;

/** O filtro do quadro numa etapa só; `null` quando o filtro de etapa aponta para outra. */
function columnWhere(ctx: CrmContext, f: BoardFilters, stageId: string, now: Date): Prisma.LeadWhereInput | null {
  if (f.etapa && f.etapa !== stageId) return null;
  return { ...leadWhere(ctx, f, now), ...OPEN_LEAD, stageId };
}

/** Os primeiros cards de cada coluna do quadro, já com os filtros. */
export async function loadBoardLeads(ctx: CrmContext, f: BoardFilters, stageIds: readonly string[], now: Date = new Date()) {
  const porColuna = await Promise.all(
    stageIds.map((stageId) => {
      const where = columnWhere(ctx, f, stageId, now);
      return where
        ? ctx.db.lead.findMany({ where, include: leadInclude, orderBy: [{ position: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }], take: BOARD_PAGE })
        : [];
    }),
  );
  return toBoardLeads(ctx, porColuna.flat(), now);
}

/** Mais cards de uma coluna, a partir do `skip`-ésimo (a mesma ordem da primeira carga). */
export async function loadColumnLeads(ctx: CrmContext, f: BoardFilters, stageId: string, skip: number, now: Date = new Date()) {
  const where = columnWhere(ctx, f, stageId, now);
  if (!where) return [];
  const rows = await ctx.db.lead.findMany({
    where,
    include: leadInclude,
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    skip: Math.max(0, skip),
    take: BOARD_PAGE,
  });
  return toBoardLeads(ctx, rows, now);
}

export interface ColumnStats {
  count: number;
  valueCents: number;
}

/**
 * Quantos leads e quanto valem, por coluna, contando todos (não só os
 * carregados). O valor segue o do card: o orçamento em aberto, senão o estimado.
 */
export async function boardColumnStats(ctx: CrmContext, f: BoardFilters, now: Date = new Date()): Promise<Record<string, ColumnStats>> {
  const rows = await ctx.db.lead.findMany({
    where: { ...leadWhere(ctx, f, now), ...OPEN_LEAD },
    select: { stageId: true, patientId: true, estimatedValueCents: true },
  });
  const pacientes = [...new Set(rows.map((r) => r.patientId).filter((id): id is string => Boolean(id)))];
  const orcamentos = pacientes.length ? await openQuotesByPatient(ctx.db, pacientes) : new Map<string, { totalCents: number }>();
  const stats: Record<string, ColumnStats> = {};
  for (const r of rows) {
    const s = (stats[r.stageId] ??= { count: 0, valueCents: 0 });
    s.count++;
    s.valueCents += (r.patientId ? orcamentos.get(r.patientId)?.totalCents : undefined) ?? r.estimatedValueCents ?? 0;
  }
  return stats;
}

/** Quantos leads batem com o filtro (sem o limite de carregar). */
export function countLeads(ctx: CrmContext, f: BoardFilters, situacao: Prisma.LeadWhereInput, now: Date = new Date()) {
  return ctx.db.lead.count({ where: { ...leadWhere(ctx, f, now), ...situacao } });
}

export { leadInclude };

/** Quantos leads (não excluídos) cada tag tem, para o painel de filtros. */
export async function tagCounts(ctx: CrmContext): Promise<Map<string, number>> {
  const rows = await ctx.db.leadTagOnLead.groupBy({
    by: ['tagId'],
    where: { tenantId: ctx.tenantId, lead: { deletedAt: null } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.tagId, r._count._all]));
}

export type ListStatus = 'abertos' | 'ganhos' | 'perdidos' | 'todos';
export type ListOrder = 'recentes' | 'nome' | 'valor' | 'etapa';

export function statusWhere(status: ListStatus): Prisma.LeadWhereInput {
  return status === 'abertos'
    ? OPEN_LEAD
    : status === 'ganhos'
      ? { wonAt: { not: null } }
      : status === 'perdidos'
        ? { lostAt: { not: null } }
        : {};
}

/**
 * Fechado num período nunca está aberto: com período de fechamento, "Abertos"
 * vira "Todos" (os ganhos e os perdidos daqueles dias).
 */
export function effectiveStatus(status: ListStatus, f: BoardFilters): ListStatus {
  return status === 'abertos' && f.periodo.field === 'fechado' && hasPeriod(f.periodo) ? 'todos' : status;
}

/** A lista: os mesmos filtros do quadro, mais a situação (ganhos, perdidos) e a ordem. */
export async function loadLeadList(
  ctx: CrmContext,
  f: BoardFilters,
  status: ListStatus,
  order: ListOrder,
  now: Date = new Date(),
  page = 1,
) {
  const situacao = statusWhere(status);
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    order === 'nome'
      ? [{ name: 'asc' }]
      : order === 'valor'
        ? [{ estimatedValueCents: { sort: 'desc', nulls: 'last' } }]
        : order === 'etapa'
          ? [{ stage: { order: 'asc' } }, { position: 'asc' }]
          : [{ createdAt: 'desc' }];

  const rows = await ctx.db.lead.findMany({
    where: { ...leadWhere(ctx, f, now), ...situacao },
    include: { ...leadInclude, stage: { select: { name: true, color: true, pipelineId: true } } },
    // Desempate pela id: a mesma ordem em todas as páginas.
    orderBy: [...orderBy, { id: 'asc' }],
    skip: (Math.max(1, page) - 1) * LIST_PAGE_SIZE,
    take: LIST_PAGE_SIZE,
  });
  const leads = await toBoardLeads(ctx, rows, now);
  const etapa = new Map(rows.map((r) => [r.id, r.stage]));
  return leads.map((l) => ({
    ...l,
    stageName: etapa.get(l.id)?.name ?? '',
    stageColor: etapa.get(l.id)?.color ?? 'gray',
    pipelineId: etapa.get(l.id)?.pipelineId ?? '',
  }));
}

export function parseListParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const status = (['abertos', 'ganhos', 'perdidos', 'todos'] as const).find((s) => s === one('situacao')) ?? 'abertos';
  const order = (['recentes', 'nome', 'valor', 'etapa'] as const).find((s) => s === one('ordem')) ?? 'recentes';
  const n = Number(one('pagina'));
  const page = Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
  return { status, order, page };
}
