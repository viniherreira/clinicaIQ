import { describe, expect, it } from 'vitest';
import {
  boardStages,
  canDeleteStage,
  fallbackStageAfterCancel,
  progressIndex,
  type StageLike,
} from './pipeline';
import { DEFAULT_STAGES } from './defaults';

const padrao: StageLike[] = DEFAULT_STAGES.map((s, i) => ({ id: `s${i}`, name: s.name, order: s.order, role: s.role }));
const id = (name: string) => padrao.find((s) => s.name === name)!.id;

describe('funil padrão', () => {
  it('cada papel aparece uma vez e todos existem', () => {
    const papeis = DEFAULT_STAGES.map((s) => s.role).filter(Boolean);
    expect(new Set(papeis).size).toBe(papeis.length);
    expect(papeis.sort()).toEqual(['CANCELLED', 'LOST', 'NEGOTIATION', 'NEW', 'SCHEDULED', 'WON']);
  });
});

describe('boardStages', () => {
  it('Fechou e Perdeu não são colunas; o resto vem na ordem', () => {
    expect(boardStages(padrao).map((s) => s.name)).toEqual([
      'Novo',
      'Em conversa',
      'Avaliação agendada',
      'Desmarcou',
      'Em negociação',
    ]);
  });

  it('respeita a ordem que a clínica escolheu, não a de criação', () => {
    const reordenado = padrao.map((s) => (s.name === 'Em conversa' ? { ...s, order: 5 } : s));
    expect(boardStages(reordenado)[0].name).toBe('Em conversa');
  });
});

describe('progressIndex', () => {
  it('Fechou está depois de tudo; Perdeu fora do caminho', () => {
    expect(progressIndex(padrao, id('Fechou'))).toBeGreaterThan(progressIndex(padrao, id('Em negociação')));
    expect(progressIndex(padrao, id('Perdeu'))).toBe(-1);
    expect(progressIndex(padrao, id('Avaliação agendada'))).toBeGreaterThan(progressIndex(padrao, id('Novo')));
  });

  it('etapa desconhecida não está no caminho', () => {
    expect(progressIndex(padrao, 'nao-existe')).toBe(-1);
  });
});

describe('fallbackStageAfterCancel', () => {
  it('no funil padrão, vai para "Desmarcou" (pelo papel: renomear não quebra)', () => {
    expect(fallbackStageAfterCancel(padrao)?.name).toBe('Desmarcou');
    const renomeado = padrao.map((s) => (s.role === 'CANCELLED' ? { ...s, name: 'Faltou ou desmarcou' } : s));
    expect(fallbackStageAfterCancel(renomeado)?.name).toBe('Faltou ou desmarcou');
  });

  // Os testes abaixo são do funil sem "Desmarcou" (de antes dela existir).
  const antigo = padrao.filter((s) => s.role !== 'CANCELLED');

  it('sem "Desmarcou", volta para "Em conversa"', () => {
    expect(fallbackStageAfterCancel(antigo)?.name).toBe('Em conversa');
  });

  it('acha pela posição, não pelo nome: renomear não quebra', () => {
    const renomeado = antigo.map((s) => (s.name === 'Em conversa' ? { ...s, name: 'Contato feito' } : s));
    expect(fallbackStageAfterCancel(renomeado)?.name).toBe('Contato feito');
  });

  it('sem nenhuma coluna antes da avaliação, cai em Novo', () => {
    const semConversa = antigo.filter((s) => s.name !== 'Em conversa');
    const novoDepois = semConversa.map((s) => (s.role === 'NEW' ? { ...s, order: 35 } : s));
    expect(fallbackStageAfterCancel(novoDepois)?.role).toBe('NEW');
  });
});

describe('canDeleteStage', () => {
  const conversa = padrao.find((s) => s.name === 'Em conversa')!;

  it('etapa com papel não sai', () => {
    const r = canDeleteStage(padrao[0], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('renomear');
    const desmarcou = canDeleteStage(padrao.find((s) => s.role === 'CANCELLED')!, 0);
    expect(desmarcou.ok).toBe(false);
    if (!desmarcou.ok) expect(desmarcou.message).toContain('agenda');
  });

  it('etapa vazia da clínica sai', () => {
    expect(canDeleteStage(conversa, 0)).toEqual({ ok: true });
  });

  it('com leads, só dizendo para onde vão — e para uma etapa aberta', () => {
    expect(canDeleteStage(conversa, 3).ok).toBe(false);
    expect(canDeleteStage(conversa, 3, conversa).ok).toBe(false);
    expect(canDeleteStage(conversa, 3, padrao.find((s) => s.role === 'WON')).ok).toBe(false);
    expect(canDeleteStage(conversa, 3, padrao[0])).toEqual({ ok: true });
  });
});
