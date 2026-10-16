import { describe, expect, it } from 'vitest';
import { DEFAULT_COLUMNS, parseColumns, serializeColumns } from './list-columns';

describe('colunas da lista', () => {
  it('sem cookie ou estragado: o padrão', () => {
    expect(parseColumns(undefined, [])).toEqual(DEFAULT_COLUMNS);
    expect(parseColumns('lixo,%%%', [])).toEqual(DEFAULT_COLUMNS);
  });

  it('só colunas que existem, sem repetir, inclusive campos ativos', () => {
    expect(parseColumns('valor,etapa,valor,campo:abc,campo:zzz,hack', ['abc'])).toEqual(['valor', 'etapa', 'campo:abc']);
  });

  it('ida e volta pelo cookie', () => {
    const cols = ['funil', 'campo:abc', 'criado'];
    expect(parseColumns(serializeColumns(cols), ['abc'])).toEqual(cols);
  });
});
