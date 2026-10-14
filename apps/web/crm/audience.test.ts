import { describe, expect, it } from 'vitest';
import { audienceFromSearch, audienceWhere, EMPTY_AUDIENCE, parseAudience } from './audience';

describe('audienceWhere', () => {
  it('sem filtro: leads abertos, nunca os excluídos', () => {
    expect(audienceWhere(EMPTY_AUDIENCE)).toEqual({ deletedAt: null, AND: [{ wonAt: null, lostAt: null }] });
  });

  it('etapa marcada vale mais que o funil', () => {
    const w = audienceWhere({ ...EMPTY_AUDIENCE, status: 'todos', pipelineIds: ['f1'], stageIds: ['s1'] });
    expect(w.AND).toEqual([{ stageId: { in: ['s1'] } }]);
    const f = audienceWhere({ ...EMPTY_AUDIENCE, status: 'todos', pipelineIds: ['f1'] });
    expect(f.AND).toEqual([{ stage: { pipelineId: { in: ['f1'] } } }]);
  });

  it('tags: qualquer uma, todas, e quem tem a tag de fora não recebe', () => {
    const any = audienceWhere({ ...EMPTY_AUDIENCE, status: 'todos', tagIds: ['a', 'b'] });
    expect(any.AND).toEqual([{ tags: { some: { tagId: { in: ['a', 'b'] } } } }]);
    const all = audienceWhere({ ...EMPTY_AUDIENCE, status: 'todos', tagIds: ['a', 'b'], tagMode: 'all', excludeTagIds: ['x'] });
    expect(all.AND).toEqual([
      { tags: { some: { tagId: 'a' } } },
      { tags: { some: { tagId: 'b' } } },
      { tags: { none: { tagId: { in: ['x'] } } } },
    ]);
  });

  it('dia de entrada no horário de Brasília, inclusive', () => {
    const w = audienceWhere({ ...EMPTY_AUDIENCE, status: 'ganhos', dateFrom: '2026-10-01', dateTo: '2026-10-13' });
    expect(w.AND).toEqual([
      { wonAt: { not: null } },
      { createdAt: { gte: new Date('2026-10-01T03:00:00.000Z'), lte: new Date('2026-10-14T02:59:59.999Z') } },
    ]);
  });

  it('fechados no período: ganho ou perdido naqueles dias', () => {
    const w = audienceWhere({ ...EMPTY_AUDIENCE, status: 'todos', dateField: 'fechado', dateFrom: '2026-10-01', dateTo: '2026-10-01' });
    const range = { gte: new Date('2026-10-01T03:00:00.000Z'), lte: new Date('2026-10-02T02:59:59.999Z') };
    expect(w.AND).toEqual([{ OR: [{ wonAt: range }, { lostAt: range }] }]);
  });

  it('tarefas, valor e nome, com as mesmas regras da busca', () => {
    const agora = new Date('2026-10-15T15:00:00Z');
    const w = audienceWhere(
      { ...EMPTY_AUDIENCE, status: 'todos', task: 'overdue', valueMin: 1500.5, valueMax: null, search: 'clareamento' },
      agora,
    );
    expect(w.AND).toEqual([
      { tasks: { some: { completedAt: null, dueAt: { lt: agora } } } },
      { estimatedValueCents: { gte: 150050 } },
      { OR: [{ name: { contains: 'clareamento', mode: 'insensitive' } }, { title: { contains: 'clareamento', mode: 'insensitive' } }] },
    ]);
    expect(audienceWhere({ ...EMPTY_AUDIENCE, status: 'todos', task: 'none' }).AND).toEqual([{ tasks: { none: { completedAt: null } } }]);
  });
});

describe('parseAudience', () => {
  it('transmissão antiga (createdFrom/createdTo) continua com o mesmo período', () => {
    expect(parseAudience({ createdFrom: '2026-10-01', createdTo: '2026-10-13' })).toMatchObject({
      dateField: 'criado',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-13',
    });
  });

  it('descarta valor negativo, tarefa e período inválidos; "fechado" sem dias não fica', () => {
    expect(parseAudience({ valueMin: -1, valueMax: '9', task: 'x', dateField: 'fechado', dateFrom: '2026-02-30' })).toMatchObject({
      valueMin: null,
      valueMax: null,
      task: '',
      dateField: 'criado',
      dateFrom: '',
    });
  });
});

describe('audienceFromSearch (Enviar transmissão para estes leads)', () => {
  it('leva funil, etapa, tags, origem, responsável e período da busca', () => {
    const a = audienceFromSearch(
      { funil: 'f1', etapa: 's1', tag: 't1,t2', origem: 'INSTAGRAM', resp: 'u1', periodo: '7d', situacao: 'perdidos' },
      '2026-10-13',
    );
    expect(a).toMatchObject({
      pipelineIds: ['f1'],
      stageIds: ['s1'],
      tagIds: ['t1', 't2'],
      sources: ['INSTAGRAM'],
      assignedToIds: ['u1'],
      dateField: 'criado',
      dateFrom: '2026-10-07',
      dateTo: '2026-10-13',
      status: 'perdidos',
    });
  });

  it('período do calendário vai igual; o "criado=mes" dos links antigos também', () => {
    expect(audienceFromSearch({ de: '2026-10-01', ate: '2026-10-15' }, '2026-10-20')).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-10-15' });
    expect(audienceFromSearch({ criado: 'mes' }, '2026-10-13')).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-10-13' });
  });

  it('"Meus leads" vira quem está mandando; sem saber quem é, não filtra', () => {
    expect(audienceFromSearch({ resp: 'me' }, '2026-10-13', 'eu').assignedToIds).toEqual(['eu']);
    expect(audienceFromSearch({ resp: 'me' }, '2026-10-13').assignedToIds).toEqual([]);
  });

  it('fechados no período: a lista mostrava ganhos e perdidos, então vão os dois', () => {
    const a = audienceFromSearch({ data: 'fechado', periodo: 'mes-passado' }, '2026-10-13');
    expect(a).toMatchObject({ dateField: 'fechado', dateFrom: '2026-09-01', dateTo: '2026-09-30', status: 'todos' });
    expect(audienceFromSearch({ data: 'fechado', periodo: 'hoje', situacao: 'ganhos' }, '2026-10-13').status).toBe('ganhos');
  });

  it('tarefa, valor e nome da busca entram; busca por telefone não', () => {
    expect(audienceFromSearch({ tarefa: 'none', vmin: '1000', vmax: '5000,5', q: 'Ana' }, '2026-10-13')).toMatchObject({
      task: 'none',
      valueMin: 1000,
      valueMax: 5000.5,
      search: 'Ana',
    });
    expect(audienceFromSearch({ q: '(11) 98765-4321' }, '2026-10-13').search).toBe('');
  });
});
