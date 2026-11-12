import 'server-only';

import { prisma, Prisma } from '@clinicaiq/db';
import type { CrmContext } from './guard';
import { change, changeTone, rate, type Tone } from './ads-rules';
import { SOURCE_LABEL } from './format';
import { OPEN_LEAD } from './leads';
import { addDays, clinicDay, dayStart } from './period';
import { buildArrivals, lastMonths, responseMedians, type Arrivals, type ArrivalRow } from './performance-rules';
import { dayCount, reportRange, type DayRange, type ReportPeriodKey } from './report-period';
import type { BoardPerson, BoardStage } from './types';

/**
 * O Painel de desempenho do CRM: o que entrou, o que agendou, o que fechou,
 * quando os leads chegam e como a equipe está. Só dados do CRM, lidos na hora
 * e somados no banco; nada é guardado à parte.
 *
 * Quem vê "só os dele" recebe os números dele (os negócios em que é o
 * responsável e as mensagens que ele mandou).
 */

/** Até quantas mensagens o tempo de resposta lê: o bastante para a mediana, sem pesar. */
const RESPONSE_SAMPLE = 5000;
/** O mapa de calor precisa de volume: olha pelo menos estes dias. */
const ARRIVALS_MIN_DAYS = 90;
const TZ = 'America/Sao_Paulo';

export interface Metric {
  value: number | null;
  previous: number | null;
  change: number | null;
  tone: Tone;
}

const metric = (value: number | null, previous: number | null, lowerIsBetter = false): Metric => {
  const delta = change(value, previous);
  return { value, previous, change: delta, tone: changeTone(delta, lowerIsBetter) };
};

export interface PerformanceData {
  range: DayRange;
  kpis: {
    newLeads: Metric;
    /** De cada lead que chegou no período, quantos agendaram (0 a 1). */
    leadToScheduled: Metric;
    /** Dos que agendaram, quantos fecharam (0 a 1). */
    scheduledToWon: Metric;
    revenueCents: Metric;
    won: number;
    /** Valor médio de cada negócio fechado no período, em centavos. */
    ticketCents: Metric;
    /** Quantos dias, na mediana, do primeiro contato até fechar. */
    cycleDays: number | null;
    /** Negócios perdidos no período. */
    lost: number;
    responseMinutes: Metric;
    openLeads: number;
    openValueCents: number;
    overdueTasks: number;
    awaitingReply: number;
  };
  arrivals: Arrivals & { days: number };
  months: { ym: string; leads: number; won: number }[];
  sources: { label: string; leads: number; won: number }[];
  stages: { id: string; name: string; reached: number; lostHere: number }[];
  lostReasons: { label: string; count: number }[];
  /** Os procedimentos mais procurados pelos leads do período. */
  procedures: { label: string; leads: number; won: number; revenueCents: number }[];
  team: { id: string; name: string; attended: number; scheduled: number; won: number; revenueCents: number; responseMinutes: number | null }[];
  bot: { attended: number };
}

interface Cohort {
  n: number;
  sched: number;
  sched_won: number;
}

export async function loadPerformance(
  ctx: Pick<CrmContext, 'tenantId' | 'userId' | 'ownOnly' | 'db'>,
  period: ReportPeriodKey,
  stages: BoardStage[],
  team: BoardPerson[],
  now: Date = new Date(),
): Promise<PerformanceData> {
  const { tenantId } = ctx;
  const { current, previous } = reportRange(period, now);
  const hoje = clinicDay(now);
  // Só os negócios da pessoa, para quem vê "só os dele".
  const dono = ctx.ownOnly ? Prisma.sql`AND l."assignedToId" = ${ctx.userId}` : Prisma.empty;
  const meu = ctx.ownOnly ? { assignedToId: ctx.userId } : {};
  const agenda = stages.filter((s) => s.role === 'SCHEDULED' || s.role === 'ATTENDED').map((s) => s.id);
  const lista = (ids: string[]) => (ids.length ? ids : ['-']);
  const local = (col: Prisma.Sql) => Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})`;

  /** Dos leads que chegaram no período: quantos agendaram e, desses, quantos fecharam. */
  const cohort = (r: DayRange) =>
    prisma.$queryRaw<Cohort[]>(Prisma.sql`
      SELECT count(*)::int AS n,
        count(*) FILTER (WHERE s.ok)::int AS sched,
        count(*) FILTER (WHERE s.ok AND l."wonAt" IS NOT NULL)::int AS sched_won
      FROM "leads" l
      LEFT JOIN LATERAL (
        SELECT true AS ok
        WHERE l."stageId" = ANY(${lista(agenda)}) OR EXISTS (
          SELECT 1 FROM "lead_activities" a
          WHERE a."tenantId" = ${tenantId} AND a."leadId" = l."id" AND a."type" = 'STAGE_CHANGED' AND a."data"->>'to' = ANY(${lista(agenda)})
        )
      ) s ON true
      WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL AND l."createdAt" >= ${r.from} AND l."createdAt" < ${r.to} ${dono}
    `).then((x) => x[0] ?? { n: 0, sched: 0, sched_won: 0 });

  const ganhos = (r: DayRange) =>
    ctx.db.lead.aggregate({ where: { deletedAt: null, wonAt: { gte: r.from, lt: r.to }, ...meu }, _count: true, _sum: { estimatedValueCents: true } });

  const mensagens = (r: DayRange) =>
    ctx.db.chatMessage.findMany({
      where: { at: { gte: r.from, lt: r.to }, ...(ctx.ownOnly ? { conversation: meu } : {}) },
      select: { conversationId: true, direction: true, origin: true, at: true, sentById: true },
      orderBy: { at: 'desc' },
      take: RESPONSE_SAMPLE,
    });

  // "Quando chegam" olha pelo menos 90 dias, para o mapa não ficar ralo.
  const diasChegada = Math.max(ARRIVALS_MIN_DAYS, dayCount(current));
  const chegadaDe = dayStart(addDays(current.until, -(diasChegada - 1)));
  const meses = lastMonths(hoje, 12);
  const mesesDe = dayStart(`${meses[0]}-01`);
  const mesesAte = dayStart(addDays(hoje, 1));

  const [
    coorte,
    coorteAntes,
    ganhosAgora,
    ganhosAntes,
    msgs,
    msgsAntes,
    abertos,
    atrasadas,
    semResposta,
    chegadas,
    criadosMes,
    ganhosMes,
    origens,
    passaram,
    perdidosEm,
    motivos,
    atendeu,
    agendouPor,
    ganhouPor,
    ciclo,
    porProcedimento,
  ] = await Promise.all([
    cohort(current),
    cohort(previous),
    ganhos(current),
    ganhos(previous),
    mensagens(current),
    mensagens(previous),
    ctx.db.lead.aggregate({ where: { ...OPEN_LEAD, ...meu }, _count: true, _sum: { estimatedValueCents: true } }),
    ctx.db.leadTask.count({ where: { completedAt: null, dueAt: { lt: now }, lead: OPEN_LEAD, ...meu } }),
    ctx.db.conversation.count({ where: { status: { not: 'DECLINED' }, awaitingReply: true, ...meu } }),
    prisma.$queryRaw<ArrivalRow[]>(Prisma.sql`
      SELECT extract(isodow FROM t.loc)::int AS dow, extract(hour FROM t.loc)::int AS hour,
        ceil(extract(day FROM t.loc) / 7.0)::int AS week, count(*)::int AS n
      FROM (
        SELECT ${local(Prisma.sql`l."createdAt"`)} AS loc FROM "leads" l
        WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL AND l."createdAt" >= ${chegadaDe} AND l."createdAt" < ${current.to} ${dono}
      ) t
      GROUP BY 1, 2, 3
    `),
    prisma.$queryRaw<{ ym: string; n: number }[]>(Prisma.sql`
      SELECT to_char(${local(Prisma.sql`l."createdAt"`)}, 'YYYY-MM') AS ym, count(*)::int AS n FROM "leads" l
      WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL AND l."createdAt" >= ${mesesDe} AND l."createdAt" < ${mesesAte} ${dono}
      GROUP BY 1
    `),
    prisma.$queryRaw<{ ym: string; n: number }[]>(Prisma.sql`
      SELECT to_char(${local(Prisma.sql`l."wonAt"`)}, 'YYYY-MM') AS ym, count(*)::int AS n FROM "leads" l
      WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL AND l."wonAt" >= ${mesesDe} AND l."wonAt" < ${mesesAte} ${dono}
      GROUP BY 1
    `),
    prisma.$queryRaw<{ source: string; n: number; won: number }[]>(Prisma.sql`
      SELECT l."source"::text AS source, count(*)::int AS n, count(*) FILTER (WHERE l."wonAt" IS NOT NULL)::int AS won FROM "leads" l
      WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL AND l."createdAt" >= ${current.from} AND l."createdAt" < ${current.to} ${dono}
      GROUP BY 1
    `),
    // Por quais etapas passaram os leads que chegaram no período: onde estão, ou de onde saíram e para onde foram.
    prisma.$queryRaw<{ sid: string; n: number }[]>(Prisma.sql`
      WITH coorte AS (
        SELECT l."id", l."stageId" FROM "leads" l
        WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL AND l."createdAt" >= ${current.from} AND l."createdAt" < ${current.to} ${dono}
      )
      SELECT t.sid, count(DISTINCT t.lead_id)::int AS n FROM (
        SELECT c."id" AS lead_id, c."stageId" AS sid FROM coorte c
        UNION
        SELECT a."leadId", a."data"->>'to' FROM "lead_activities" a JOIN coorte c ON c."id" = a."leadId"
          WHERE a."tenantId" = ${tenantId} AND a."type" IN ('STAGE_CHANGED', 'LOST', 'REOPENED')
        UNION
        SELECT a."leadId", a."data"->>'from' FROM "lead_activities" a JOIN coorte c ON c."id" = a."leadId"
          WHERE a."tenantId" = ${tenantId} AND a."type" IN ('STAGE_CHANGED', 'LOST', 'REOPENED')
      ) t
      WHERE t.sid IS NOT NULL
      GROUP BY 1
    `),
    // Em qual etapa estavam os que foram perdidos no período.
    prisma.$queryRaw<{ sid: string; n: number }[]>(Prisma.sql`
      SELECT a."data"->>'from' AS sid, count(DISTINCT a."leadId")::int AS n
      FROM "lead_activities" a JOIN "leads" l ON l."id" = a."leadId" AND l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL
      WHERE a."tenantId" = ${tenantId} AND a."type" = 'LOST' AND a."createdAt" >= ${current.from} AND a."createdAt" < ${current.to}
        AND a."data"->>'from' IS NOT NULL ${dono}
      GROUP BY 1
    `),
    ctx.db.lead.groupBy({ by: ['lostReasonId'], where: { deletedAt: null, lostAt: { gte: current.from, lt: current.to }, ...meu }, _count: true }),
    // Quantas conversas cada pessoa atendeu (mandou mensagem pelo CRM); o robô numa linha só.
    prisma.$queryRaw<{ who: string | null; bot: boolean; n: number }[]>(Prisma.sql`
      SELECT m."sentById" AS who, (m."origin" = 'BOT') AS bot, count(DISTINCT m."conversationId")::int AS n
      FROM "chat_messages" m
      WHERE m."tenantId" = ${tenantId} AND m."direction" = 'OUTBOUND' AND m."at" >= ${current.from} AND m."at" < ${current.to}
        AND ((m."origin" = 'CRM' AND m."sentById" IS NOT NULL) OR m."origin" = 'BOT')
      GROUP BY 1, 2
    `),
    prisma.$queryRaw<{ who: string | null; n: number }[]>(Prisma.sql`
      SELECT l."assignedToId" AS who, count(DISTINCT a."leadId")::int AS n
      FROM "lead_activities" a JOIN "leads" l ON l."id" = a."leadId" AND l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL
      WHERE a."tenantId" = ${tenantId} AND a."type" = 'STAGE_CHANGED' AND a."createdAt" >= ${current.from} AND a."createdAt" < ${current.to}
        AND a."data"->>'to' = ANY(${lista(stages.filter((s) => s.role === 'SCHEDULED').map((s) => s.id))}) ${dono}
      GROUP BY 1
    `),
    ctx.db.lead.groupBy({
      by: ['assignedToId'],
      where: { deletedAt: null, wonAt: { gte: current.from, lt: current.to }, ...meu },
      _count: true,
      _sum: { estimatedValueCents: true },
    }),
    // Do primeiro contato até fechar, em dias (mediana dos fechados no período).
    prisma.$queryRaw<{ dias: number | null }[]>(Prisma.sql`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (l."wonAt" - l."createdAt")) / 86400.0)::float8 AS dias
      FROM "leads" l
      WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL AND l."wonAt" >= ${current.from} AND l."wonAt" < ${current.to} ${dono}
    `),
    prisma.$queryRaw<{ pid: string; n: number; won: number; cents: bigint | number | null }[]>(Prisma.sql`
      SELECT l."interestProcedureId" AS pid, count(*)::int AS n,
        count(*) FILTER (WHERE l."wonAt" IS NOT NULL)::int AS won,
        sum(CASE WHEN l."wonAt" IS NOT NULL THEN COALESCE(l."estimatedValueCents", 0) ELSE 0 END)::bigint AS cents
      FROM "leads" l
      WHERE l."tenantId" = ${tenantId} AND l."deletedAt" IS NULL AND l."interestProcedureId" IS NOT NULL
        AND l."createdAt" >= ${current.from} AND l."createdAt" < ${current.to} ${dono}
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 8
    `),
  ]);

  const nomesMotivo = new Map(
    (await ctx.db.lostReason.findMany({ where: { id: { in: motivos.map((m) => m.lostReasonId).filter((id): id is string => !!id) } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]),
  );

  const nomesProcedimento = new Map(
    (porProcedimento.length ? await ctx.db.procedure.findMany({ where: { id: { in: porProcedimento.map((p) => p.pid) } }, select: { id: true, name: true } }) : []).map((p) => [p.id, p.name]),
  );
  const perdidos = motivos.reduce((s, m) => s + m._count, 0);
  const ticket = (g: { _count: number; _sum: { estimatedValueCents: number | null } }) =>
    g._count > 0 ? Math.round((g._sum.estimatedValueCents ?? 0) / g._count) : null;

  const resposta = responseMedians(msgs);
  const respostaAntes = responseMedians(msgsAntes);
  const receita = ganhosAgora._sum.estimatedValueCents ?? 0;

  const porMes = (rows: { ym: string; n: number }[]) => new Map(rows.map((r) => [r.ym, r.n]));
  const [criados, fechados] = [porMes(criadosMes), porMes(ganhosMes)];
  const mapa = (rows: { sid: string; n: number }[]) => new Map(rows.map((r) => [r.sid, r.n]));
  const [passou, perdeu] = [mapa(passaram), mapa(perdidosEm)];

  const pessoas = ctx.ownOnly ? team.filter((p) => p.id === ctx.userId) : team;
  const equipe = pessoas
    .map((p) => {
      const g = ganhouPor.find((x) => x.assignedToId === p.id);
      return {
        id: p.id,
        name: p.name,
        attended: atendeu.find((x) => !x.bot && x.who === p.id)?.n ?? 0,
        scheduled: agendouPor.find((x) => x.who === p.id)?.n ?? 0,
        won: g?._count ?? 0,
        revenueCents: g?._sum.estimatedValueCents ?? 0,
        responseMinutes: resposta.byPerson.get(p.id) ?? null,
      };
    })
    .filter((p) => ctx.ownOnly || p.attended || p.scheduled || p.won)
    .sort((a, b) => b.revenueCents - a.revenueCents || b.won - a.won || b.scheduled - a.scheduled || b.attended - a.attended);

  return {
    range: current,
    kpis: {
      newLeads: metric(coorte.n, coorteAntes.n),
      leadToScheduled: metric(rate(coorte.sched, coorte.n), rate(coorteAntes.sched, coorteAntes.n)),
      scheduledToWon: metric(rate(coorte.sched_won, coorte.sched), rate(coorteAntes.sched_won, coorteAntes.sched)),
      revenueCents: metric(receita, ganhosAntes._sum.estimatedValueCents ?? 0),
      won: ganhosAgora._count,
      ticketCents: metric(ticket(ganhosAgora), ticket(ganhosAntes)),
      cycleDays: ciclo[0]?.dias == null ? null : Math.round(ciclo[0].dias * 10) / 10,
      lost: perdidos,
      responseMinutes: metric(resposta.all, respostaAntes.all, true),
      openLeads: abertos._count,
      openValueCents: abertos._sum.estimatedValueCents ?? 0,
      overdueTasks: atrasadas,
      awaitingReply: semResposta,
    },
    arrivals: { ...buildArrivals(chegadas), days: diasChegada },
    months: meses.map((ym) => ({ ym, leads: criados.get(ym) ?? 0, won: fechados.get(ym) ?? 0 })),
    sources: origens
      .map((o) => ({ label: SOURCE_LABEL[o.source] ?? o.source, leads: o.n, won: o.won }))
      .sort((a, b) => b.leads - a.leads || a.label.localeCompare(b.label, 'pt-BR')),
    stages: stages.map((s) => ({ id: s.id, name: s.name, reached: passou.get(s.id) ?? 0, lostHere: perdeu.get(s.id) ?? 0 })),
    lostReasons: motivos
      .map((m) => ({ label: m.lostReasonId ? nomesMotivo.get(m.lostReasonId) ?? 'Motivo removido' : 'Sem motivo', count: m._count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR')),
    procedures: porProcedimento.map((p) => ({
      label: nomesProcedimento.get(p.pid) ?? 'Procedimento removido',
      leads: p.n,
      won: p.won,
      revenueCents: Number(p.cents ?? 0),
    })),
    team: equipe,
    bot: { attended: ctx.ownOnly ? 0 : atendeu.filter((x) => x.bot).reduce((s, x) => s + x.n, 0) },
  };
}
