import { describe, expect, it } from 'vitest';
import { parseFilters } from './filters';
import { NO_PERIOD } from './period';

describe('parseFilters', () => {
  it('sem nada: leads ativos de todos', () => {
    expect(parseFilters({})).toEqual({
      q: '', resp: 'all', tarefa: '', tags: [], origem: '', funil: '', etapa: '', periodo: NO_PERIOD, valorMin: null, valorMax: null,
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

  it('origem e tarefa só aceitam os valores conhecidos', () => {
    const f = parseFilters({ origem: 'HACK', tarefa: 'qualquer' });
    expect([f.origem, f.tarefa]).toEqual(['', '']);
    expect(parseFilters({ origem: 'INSTAGRAM', tarefa: 'overdue' })).toMatchObject({ origem: 'INSTAGRAM', tarefa: 'overdue' });
  });

  it('período: atalho, dias do calendário e o "criado" dos links antigos', () => {
    expect(parseFilters({ periodo: 'mes-passado' }).periodo).toEqual({ field: 'criado', preset: 'mes-passado', from: '', to: '' });
    expect(parseFilters({ de: '2026-10-01', ate: '2026-10-15' }).periodo).toEqual({
      field: 'criado',
      preset: '',
      from: '2026-10-01',
      to: '2026-10-15',
    });
    expect(parseFilters({ criado: '7d' }).periodo.preset).toBe('7d');
  });
});
