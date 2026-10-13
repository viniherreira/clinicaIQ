import { describe, expect, it } from 'vitest';
import { createdSince, parseFilters } from './filters';

describe('parseFilters', () => {
  it('sem nada: leads ativos de todos', () => {
    expect(parseFilters({})).toEqual({
      q: '', resp: 'all', tarefa: '', tags: [], origem: '', funil: '', etapa: '', criado: '', valorMin: null, valorMax: null,
    });
  });

  it('várias tags separadas por vírgula; o que não parece id sai', () => {
    expect(parseFilters({ tag: 'clx1abc2def3,<script>,clx9zzz8yyy7' }).tags).toEqual(['clx1abc2def3', 'clx9zzz8yyy7']);
  });

  it('valor com vírgula vira número; negativo e texto não valem', () => {
    const f = parseFilters({ vmin: '1500,50', vmax: '-3' });
    expect(f.valorMin).toBe(1500.5);
    expect(f.valorMax).toBeNull();
    expect(parseFilters({ vmin: 'abc' }).valorMin).toBeNull();
  });

  it('origem, tarefa e período só aceitam os valores conhecidos', () => {
    const f = parseFilters({ origem: 'HACK', tarefa: 'qualquer', criado: 'ontem' });
    expect([f.origem, f.tarefa, f.criado]).toEqual(['', '', '']);
    expect(parseFilters({ origem: 'INSTAGRAM', tarefa: 'overdue', criado: '7d' })).toMatchObject({
      origem: 'INSTAGRAM',
      tarefa: 'overdue',
      criado: '7d',
    });
  });
});

describe('createdSince (fuso de Brasília)', () => {
  // 13/10/2026 às 01:30 em Brasília = 04:30 UTC.
  const agora = new Date('2026-10-13T04:30:00Z');

  it('hoje começa à meia-noite de Brasília', () => {
    expect(createdSince('hoje', agora)?.toISOString()).toBe('2026-10-13T03:00:00.000Z');
  });

  it('logo depois da meia-noite UTC ainda é o dia anterior em Brasília', () => {
    expect(createdSince('hoje', new Date('2026-10-13T01:00:00Z'))?.toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });

  it('7 dias contam hoje e os 6 anteriores; o mês começa no dia 1', () => {
    expect(createdSince('7d', agora)?.toISOString()).toBe('2026-10-07T03:00:00.000Z');
    expect(createdSince('mes', agora)?.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(createdSince('', agora)).toBeNull();
  });
});
