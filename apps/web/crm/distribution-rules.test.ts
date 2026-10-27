import { describe, expect, it } from 'vitest';
import { rankCandidates, readDistribution, type Candidate } from './distribution-rules';

const d = (min: number) => new Date(Date.UTC(2026, 9, 27, 12, min));
const p = (id: string, o: Partial<Candidate> = {}): Candidate => ({
  id,
  available: true,
  lastAssignedAt: null,
  openLeads: 0,
  createdAt: d(0),
  ...o,
});

describe('readDistribution', () => {
  it('sem nada gravado: desligada, rodízio, só disponíveis', () => {
    expect(readDistribution(null)).toEqual({ enabled: false, mode: 'rotation', onlyAvailable: true });
    expect(readDistribution({ crmDistribution: 'lixo' })).toEqual({ enabled: false, mode: 'rotation', onlyAvailable: true });
  });

  it('lê o que foi gravado e ignora valor estranho', () => {
    expect(readDistribution({ crmDistribution: { enabled: true, mode: 'load', onlyAvailable: false } })).toEqual({
      enabled: true,
      mode: 'load',
      onlyAvailable: false,
    });
    expect(readDistribution({ crmDistribution: { enabled: 'sim', mode: 'sorteio' } }).mode).toBe('rotation');
  });
});

describe('rankCandidates', () => {
  it('rodízio: quem nunca recebeu vem antes, depois quem recebeu há mais tempo', () => {
    const lista = [p('ana', { lastAssignedAt: d(5) }), p('bia', { lastAssignedAt: d(1) }), p('caio')];
    expect(rankCandidates(lista, { mode: 'rotation', onlyAvailable: true })).toEqual(['caio', 'bia', 'ana']);
  });

  it('menos ocupado: menos negócios abertos; empate, rodízio', () => {
    const lista = [
      p('ana', { openLeads: 3 }),
      p('bia', { openLeads: 1, lastAssignedAt: d(9) }),
      p('caio', { openLeads: 1, lastAssignedAt: d(2) }),
    ];
    expect(rankCandidates(lista, { mode: 'load', onlyAvailable: true })).toEqual(['caio', 'bia', 'ana']);
  });

  it('ausente fica de fora; se todos estão ausentes, distribui entre todos', () => {
    const lista = [p('ana', { available: false }), p('bia', { lastAssignedAt: d(3) })];
    expect(rankCandidates(lista, { mode: 'rotation', onlyAvailable: true })).toEqual(['bia']);
    expect(rankCandidates(lista, { mode: 'rotation', onlyAvailable: false })).toEqual(['ana', 'bia']);
    const ninguem = [p('ana', { available: false }), p('bia', { available: false, lastAssignedAt: d(1) })];
    expect(rankCandidates(ninguem, { mode: 'rotation', onlyAvailable: true })).toEqual(['ana', 'bia']);
  });

  it('sem ninguém que recebe, ninguém', () => {
    expect(rankCandidates([], { mode: 'load', onlyAvailable: true })).toEqual([]);
  });
});
