import { describe, expect, it } from 'vitest';
import { appendColumn, columnTotals, LOAD_OVERLAP, mergeRefresh, nextSkip, shiftTotals } from './board-columns';

const lead = (id: string, stageId = 'a') => ({ id, stageId });

describe('carga do quadro por coluna', () => {
  it('a próxima leva repete alguns cards já vistos, nunca pede antes do começo', () => {
    expect(nextSkip(50)).toBe(50 - LOAD_OVERLAP);
    expect(nextSkip(2)).toBe(0);
    expect(nextSkip(0)).toBe(0);
  });

  it('junta a leva nova no fim, sem repetir e sem card que mudou de coluna', () => {
    const r = appendColumn([lead('1'), lead('2')], [lead('2'), lead('3'), lead('4', 'b')], 'a');
    expect(r.leads.map((l) => l.id)).toEqual(['1', '2', '3']);
    expect(r.added).toBe(1);
    expect(appendColumn([lead('1')], [lead('1')], 'a').added).toBe(0);
  });

  it('atualização da página: sem coluna aberta, vale só o que veio', () => {
    expect(mergeRefresh([lead('1')], [lead('1'), lead('9')], new Set())).toEqual([lead('1')]);
  });

  it('atualização da página: guarda o que a pessoa carregou rolando, e o servidor ganha', () => {
    const servidor = [lead('1', 'b'), lead('2')];
    const tela = [lead('1', 'a'), lead('2'), lead('60'), lead('61', 'c')];
    const r = mergeRefresh(servidor, tela, new Set(['a']));
    // O 1 foi para a coluna b no servidor; o 60 era da coluna a, aberta; o 61 é de uma fechada.
    expect(r).toEqual([lead('1', 'b'), lead('2'), lead('60')]);
  });

  it('as contas andam com o card: sai de uma, entra na outra', () => {
    let a = shiftTotals({}, 'a', 'b', 300);
    expect(a).toEqual({ a: { count: -1, valueCents: -300 }, b: { count: 1, valueCents: 300 } });
    a = shiftTotals(a, 'b', null, 300);
    expect(a.b).toEqual({ count: 0, valueCents: 0 });
    expect(shiftTotals({}, 'a', 'a', 300)).toEqual({});
  });

  it('a conta da coluna soma o servidor com o que mudou na tela, sem ficar negativa', () => {
    const stats = { a: { count: 6000, valueCents: 900_000 } };
    expect(columnTotals(stats, { a: { count: -1, valueCents: -500 } }, 'a')).toEqual({ count: 5999, valueCents: 899_500 });
    expect(columnTotals(stats, {}, 'z')).toEqual({ count: 0, valueCents: 0 });
    expect(columnTotals({}, { z: { count: -1, valueCents: 0 } }, 'z').count).toBe(0);
  });
});
