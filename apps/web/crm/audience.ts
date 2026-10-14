import type { LeadSource, Prisma } from '@clinicaiq/db';
import { isDay, parsePeriod, rangeWhere, resolvePeriod, type PeriodField } from './period';

/**
 * Quem recebe uma transmissão: os mesmos filtros da busca de leads (funil,
 * etapa, tags, período, situação, origem, responsável, tarefas, valor e nome).
 * Puro — a tela monta, o servidor confere de novo com `parseAudience`.
 *
 * Lista vazia = não filtra por aquilo.
 */
export type AudienceStatus = 'abertos' | 'ganhos' | 'perdidos' | 'todos';
export type AudienceTask = '' | 'none' | 'overdue';

export interface Audience {
  pipelineIds: string[];
  stageIds: string[];
  tagIds: string[];
  /** 'any' = tem qualquer uma das tags; 'all' = tem todas. */
  tagMode: 'any' | 'all';
  /** Não recebe quem tem alguma destas tags. */
  excludeTagIds: string[];
  sources: LeadSource[];
  assignedToIds: string[];
  /** Qual data conta no período: entrada do lead ou fechamento (ganho/perdido). */
  dateField: PeriodField;
  /** "AAAA-MM-DD" no horário da clínica, inclusive. Dias fixos: a transmissão
      agendada para amanhã manda para quem estava no período escolhido hoje. */
  dateFrom: string;
  dateTo: string;
  status: AudienceStatus;
  /** Situação da tarefa na hora do envio: sem tarefa aberta ou com atrasada. */
  task: AudienceTask;
  /** Valor de venda em reais. */
  valueMin: number | null;
  valueMax: number | null;
  /** Nome ou título do negócio contém. */
  search: string;
}

export const EMPTY_AUDIENCE: Audience = {
  pipelineIds: [],
  stageIds: [],
  tagIds: [],
  tagMode: 'any',
  excludeTagIds: [],
  sources: [],
  assignedToIds: [],
  dateField: 'criado',
  dateFrom: '',
  dateTo: '',
  status: 'abertos',
  task: '',
  valueMin: null,
  valueMax: null,
  search: '',
};

const SOURCES: readonly LeadSource[] = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'];
const STATUS: readonly AudienceStatus[] = ['abertos', 'ganhos', 'perdidos', 'todos'];

/** Lê o público vindo da tela (ou de uma transmissão antiga) sem confiar em nada. */
export function parseAudience(raw: unknown): Audience {
  const a = (raw ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : []);
  const dia = (v: unknown) => (typeof v === 'string' && isDay(v) ? v : '');
  const reais = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, 100_000_000) : null);
  // Transmissões gravadas antes do período por fechamento guardavam "createdFrom/To".
  const de = dia(a.dateFrom) || dia(a.createdFrom);
  const ate = dia(a.dateTo) || dia(a.createdTo);
  return {
    pipelineIds: ids(a.pipelineIds),
    stageIds: ids(a.stageIds),
    tagIds: ids(a.tagIds),
    tagMode: a.tagMode === 'all' ? 'all' : 'any',
    excludeTagIds: ids(a.excludeTagIds),
    sources: ids(a.sources).filter((s): s is LeadSource => (SOURCES as readonly string[]).includes(s)),
    assignedToIds: ids(a.assignedToIds),
    dateField: a.dateField === 'fechado' && (de || ate) ? 'fechado' : 'criado',
    dateFrom: de,
    dateTo: ate,
    status: STATUS.includes(a.status as AudienceStatus) ? (a.status as AudienceStatus) : 'abertos',
    task: a.task === 'none' || a.task === 'overdue' ? a.task : '',
    valueMin: reais(a.valueMin),
    valueMax: reais(a.valueMax),
    search: typeof a.search === 'string' ? a.search.trim().slice(0, 80) : '',
  };
}

/** Os leads que batem com o público. Nunca os excluídos. */
export function audienceWhere(a: Audience, now: Date = new Date()): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (a.status === 'abertos') and.push({ wonAt: null, lostAt: null });
  if (a.status === 'ganhos') and.push({ wonAt: { not: null } });
  if (a.status === 'perdidos') and.push({ lostAt: { not: null } });
  // Etapa marcada vale mais que o funil inteiro (a etapa já diz o funil).
  if (a.stageIds.length) and.push({ stageId: { in: a.stageIds } });
  else if (a.pipelineIds.length) and.push({ stage: { pipelineId: { in: a.pipelineIds } } });
  if (a.tagIds.length) {
    if (a.tagMode === 'all') for (const t of a.tagIds) and.push({ tags: { some: { tagId: t } } });
    else and.push({ tags: { some: { tagId: { in: a.tagIds } } } });
  }
  if (a.excludeTagIds.length) and.push({ tags: { none: { tagId: { in: a.excludeTagIds } } } });
  if (a.sources.length) and.push({ source: { in: a.sources } });
  if (a.assignedToIds.length) and.push({ assignedToId: { in: a.assignedToIds } });
  const periodo = rangeWhere(a.dateField, a.dateFrom, a.dateTo);
  if (periodo) and.push(periodo);
  // As mesmas regras de `taskStatus`: sem tarefa aberta; ou alguma aberta já vencida.
  if (a.task === 'none') and.push({ tasks: { none: { completedAt: null } } });
  if (a.task === 'overdue') and.push({ tasks: { some: { completedAt: null, dueAt: { lt: now } } } });
  if (a.valueMin != null || a.valueMax != null) {
    and.push({
      estimatedValueCents: {
        ...(a.valueMin != null ? { gte: Math.round(a.valueMin * 100) } : {}),
        ...(a.valueMax != null ? { lte: Math.round(a.valueMax * 100) } : {}),
      },
    });
  }
  if (a.search) and.push({ OR: [{ name: { contains: a.search, mode: 'insensitive' } }, { title: { contains: a.search, mode: 'insensitive' } }] });
  return { deletedAt: null, ...(and.length ? { AND: and } : {}) };
}

/**
 * O público a partir dos filtros da busca de leads (a URL do funil ou da
 * lista), para o "Enviar transmissão para estes leads": a lista de quem
 * recebe é a mesma que estava na tela.
 *
 * `meId` resolve "Meus leads". O período vira dias fixos (os de hoje).
 * Busca por telefone não vira público — é uma pessoa só.
 */
export function audienceFromSearch(
  sp: Record<string, string | string[] | undefined>,
  today: string,
  meId?: string,
): Audience {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const lista = (k: string) => one(k).split(',').map((x) => x.trim()).filter(Boolean);
  const reais = (k: string) => {
    const n = Number(one(k).replace(',', '.'));
    return one(k) && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const periodo = parsePeriod(sp);
  const dias = resolvePeriod(periodo, today);
  const situacao = one('situacao');
  const resp = one('resp');
  const tarefa = one('tarefa');
  const q = one('q').trim();
  let status: AudienceStatus = situacao === 'ganhos' || situacao === 'perdidos' || situacao === 'todos' ? situacao : 'abertos';
  // Fechados num período nunca estão abertos: a lista mostrava todos os fechados.
  if (dias && periodo.field === 'fechado' && status === 'abertos') status = 'todos';
  return parseAudience({
    pipelineIds: one('funil') ? [one('funil')] : [],
    stageIds: one('etapa') ? [one('etapa')] : [],
    tagIds: lista('tag'),
    sources: one('origem') ? [one('origem')] : [],
    assignedToIds: resp === 'me' ? (meId ? [meId] : []) : resp && resp !== 'all' ? [resp] : [],
    dateField: periodo.field,
    dateFrom: dias?.from ?? '',
    dateTo: dias?.to ?? '',
    status,
    task: tarefa,
    valueMin: reais('vmin'),
    valueMax: reais('vmax'),
    search: q.replace(/\D/g, '').length >= 10 ? '' : q,
  });
}
