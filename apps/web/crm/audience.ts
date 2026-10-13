import type { LeadSource, Prisma } from '@clinicaiq/db';

/**
 * Quem recebe uma transmissão: os mesmos filtros da busca de leads (funil,
 * etapa, tags, dia de entrada, situação, origem, responsável). Puro — a tela
 * monta, o servidor confere de novo com `parseAudience`.
 *
 * Lista vazia = não filtra por aquilo.
 */
export type AudienceStatus = 'abertos' | 'ganhos' | 'perdidos' | 'todos';

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
  /** Dia em que o lead entrou, "AAAA-MM-DD" no horário da clínica (inclusive). */
  createdFrom: string;
  createdTo: string;
  status: AudienceStatus;
}

export const EMPTY_AUDIENCE: Audience = {
  pipelineIds: [],
  stageIds: [],
  tagIds: [],
  tagMode: 'any',
  excludeTagIds: [],
  sources: [],
  assignedToIds: [],
  createdFrom: '',
  createdTo: '',
  status: 'abertos',
};

const SOURCES: readonly LeadSource[] = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'];
const STATUS: readonly AudienceStatus[] = ['abertos', 'ganhos', 'perdidos', 'todos'];
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Lê o público vindo da tela (ou de uma transmissão antiga) sem confiar em nada. */
export function parseAudience(raw: unknown): Audience {
  const a = (raw ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : []);
  const dia = (v: unknown) => (typeof v === 'string' && DIA.test(v) && !Number.isNaN(Date.parse(v)) ? v : '');
  return {
    pipelineIds: ids(a.pipelineIds),
    stageIds: ids(a.stageIds),
    tagIds: ids(a.tagIds),
    tagMode: a.tagMode === 'all' ? 'all' : 'any',
    excludeTagIds: ids(a.excludeTagIds),
    sources: ids(a.sources).filter((s): s is LeadSource => (SOURCES as readonly string[]).includes(s)),
    assignedToIds: ids(a.assignedToIds),
    createdFrom: dia(a.createdFrom),
    createdTo: dia(a.createdTo),
    status: STATUS.includes(a.status as AudienceStatus) ? (a.status as AudienceStatus) : 'abertos',
  };
}

/** Início do dia (00:00 em Brasília, sem horário de verão) e o fim (23:59:59.999). */
const inicioDoDia = (d: string) => new Date(`${d}T00:00:00-03:00`);
const fimDoDia = (d: string) => new Date(`${d}T23:59:59.999-03:00`);

/** Os leads que batem com o público. Nunca os excluídos. */
export function audienceWhere(a: Audience): Prisma.LeadWhereInput {
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
  if (a.createdFrom || a.createdTo) {
    and.push({
      createdAt: {
        ...(a.createdFrom ? { gte: inicioDoDia(a.createdFrom) } : {}),
        ...(a.createdTo ? { lte: fimDoDia(a.createdTo) } : {}),
      },
    });
  }
  return { deletedAt: null, ...(and.length ? { AND: and } : {}) };
}

/**
 * O público a partir dos filtros da busca de leads (a URL do funil ou da
 * lista), para o "Enviar transmissão para estes leads".
 */
export function audienceFromSearch(sp: Record<string, string | string[] | undefined>, today: string): Audience {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const lista = (k: string) => one(k).split(',').map((x) => x.trim()).filter(Boolean);
  const criado = one('criado');
  const desde = (dias: number) => {
    const d = new Date(`${today}T12:00:00-03:00`);
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10);
  };
  const createdFrom =
    criado === 'hoje' ? today : criado === '7d' ? desde(6) : criado === '30d' ? desde(29) : criado === 'mes' ? `${today.slice(0, 8)}01` : '';
  const situacao = one('situacao');
  return parseAudience({
    pipelineIds: one('funil') ? [one('funil')] : [],
    stageIds: one('etapa') ? [one('etapa')] : [],
    tagIds: lista('tag'),
    sources: one('origem') ? [one('origem')] : [],
    assignedToIds: one('resp') && one('resp') !== 'me' ? [one('resp')] : [],
    createdFrom,
    status: situacao === 'ganhos' || situacao === 'perdidos' || situacao === 'todos' ? situacao : 'abertos',
  });
}
