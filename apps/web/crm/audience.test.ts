import { describe, expect, it } from 'vitest';
import { audienceFromSearch, audienceWhere, EMPTY_AUDIENCE } from './audience';

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
    const w = audienceWhere({ ...EMPTY_AUDIENCE, status: 'ganhos', createdFrom: '2026-10-01', createdTo: '2026-10-13' });
    expect(w.AND).toEqual([
      { wonAt: { not: null } },
      { createdAt: { gte: new Date('2026-10-01T03:00:00.000Z'), lte: new Date('2026-10-14T02:59:59.999Z') } },
    ]);
  });
});

describe('audienceFromSearch (Enviar transmissão para estes leads)', () => {
  it('leva funil, etapa, tags, origem, responsável e período da busca', () => {
    const a = audienceFromSearch(
      { funil: 'f1', etapa: 's1', tag: 't1,t2', origem: 'INSTAGRAM', resp: 'u1', criado: '7d', situacao: 'perdidos' },
      '2026-10-13',
    );
    expect(a).toMatchObject({
      pipelineIds: ['f1'],
      stageIds: ['s1'],
      tagIds: ['t1', 't2'],
      sources: ['INSTAGRAM'],
      assignedToIds: ['u1'],
      createdFrom: '2026-10-07',
      status: 'perdidos',
    });
  });

  it('"Meus leads" não vira filtro de responsável; mês começa no dia 1', () => {
    const a = audienceFromSearch({ resp: 'me', criado: 'mes' }, '2026-10-13');
    expect(a.assignedToIds).toEqual([]);
    expect(a.createdFrom).toBe('2026-10-01');
  });
});
