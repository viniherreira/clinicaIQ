import { describe, expect, it } from 'vitest';
import { conditionChips, daysLabel, matchesConditions, parseConditions, triggerMatches } from './stage-automation-rules';

// Horas de São Paulo (UTC-3): 2026-10-31 é sábado.
const sp = (iso: string) => new Date(`${iso}-03:00`);

describe('gatilho', () => {
  it.each([
    ['ENTER', 'created', true],
    ['ENTER', 'moved', true],
    ['CREATED', 'created', true],
    ['CREATED', 'moved', false],
    ['MOVED', 'moved', true],
    ['MOVED', 'created', false],
  ] as const)('%s em %s → %s', (t, k, ok) => expect(triggerMatches(t, k)).toBe(ok));
});

describe('condições: leitura', () => {
  it('limpa o que não vale', () => {
    expect(parseConditions({ days: [6, 0, 9, 6], from: '25:00', to: '08:00', sources: ['INSTAGRAM', 'X'], tagIds: ['', 't1'] })).toEqual({
      days: [0, 6],
      sources: ['INSTAGRAM'],
      tagIds: ['t1'],
    });
  });
  it('todos os dias marcados é o mesmo que nenhum', () => {
    expect(parseConditions({ days: [0, 1, 2, 3, 4, 5, 6] })).toEqual({});
  });
  it('horário só com "de" e "até" diferentes', () => {
    expect(parseConditions({ from: '08:00' })).toEqual({});
    expect(parseConditions({ from: '08:00', to: '08:00' })).toEqual({});
    expect(parseConditions({ from: '08:00', to: '17:30' })).toEqual({ from: '08:00', to: '17:30' });
  });
  it('lixo vira nada', () => {
    expect(parseConditions(null)).toEqual({});
    expect(parseConditions('x')).toEqual({});
  });
});

describe('condições: batem?', () => {
  const lead = { source: 'INSTAGRAM', tagIds: ['t1'] };

  it('sem condição, sempre', () => expect(matchesConditions({}, lead, sp('2026-10-31T03:00:00'))).toBe(true));

  it('fim de semana', () => {
    const c = { days: [0, 6] };
    expect(matchesConditions(c, lead, sp('2026-10-31T10:00:00'))).toBe(true);
    expect(matchesConditions(c, lead, sp('2026-11-02T10:00:00'))).toBe(false);
  });

  it('horário comercial (Seg - Sex de 08:00 às 17:30)', () => {
    const c = { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:30' };
    expect(matchesConditions(c, lead, sp('2026-11-02T08:00:00'))).toBe(true);
    expect(matchesConditions(c, lead, sp('2026-11-02T17:30:00'))).toBe(false);
    expect(matchesConditions(c, lead, sp('2026-11-02T07:59:00'))).toBe(false);
  });

  it('faixa que passa da meia-noite', () => {
    const c = { from: '18:00', to: '08:00' };
    expect(matchesConditions(c, lead, sp('2026-11-02T23:00:00'))).toBe(true);
    expect(matchesConditions(c, lead, sp('2026-11-03T02:00:00'))).toBe(true);
    expect(matchesConditions(c, lead, sp('2026-11-03T12:00:00'))).toBe(false);
  });

  it('origem e tag', () => {
    expect(matchesConditions({ sources: ['INSTAGRAM', 'SITE'] }, lead, new Date())).toBe(true);
    expect(matchesConditions({ sources: ['WHATSAPP'] }, lead, new Date())).toBe(false);
    expect(matchesConditions({ tagIds: ['t2', 't1'] }, lead, new Date())).toBe(true);
    expect(matchesConditions({ tagIds: ['t2'] }, lead, new Date())).toBe(false);
  });
});

describe('rótulos', () => {
  it.each([
    [[1, 2, 3, 4, 5], 'Seg - Sex'],
    [[0, 6], 'Sáb - Dom'],
    [[1, 3, 5], 'Seg, Qua, Sex'],
    [[2], 'Ter'],
  ])('%j → %s', (d, txt) => expect(daysLabel(d)).toBe(txt));

  it('chips do cartão', () => {
    const chips = conditionChips(
      { days: [0, 6], from: '00:00', to: '23:30', sources: ['INSTAGRAM'], tagIds: ['t1', 'x'] },
      { tags: new Map([['t1', 'Facebook']]), sources: { INSTAGRAM: 'Instagram' } },
    );
    expect(chips).toEqual(['Sáb - Dom de 00:00 às 23:30', 'Origem: Instagram', 'Com a tag: Facebook, (apagada)']);
  });
});
