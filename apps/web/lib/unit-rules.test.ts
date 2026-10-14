import { describe, expect, it } from 'vitest';
import { allowedUnits, inUnit, mainUnit, pickUnit, shortUnitNames, unitAppointmentWhere } from './unit-rules';

const u = (id: string, order: number, active = true) => ({ id, name: id, order, active });
const UNIDADES = [u('sul', 2), u('centro', 0), u('norte', 1, false)];

describe('unidades', () => {
  it('a principal é a de menor ordem', () => {
    expect(mainUnit(UNIDADES)?.id).toBe('centro');
  });

  it('quem não tem unidade marcada vê todas as ativas, na ordem', () => {
    expect(allowedUnits(UNIDADES, []).map((x) => x.id)).toEqual(['centro', 'sul']);
  });

  it('quem trabalha numa só vê só ela; unidade desativada some; sem nenhuma sobra a principal', () => {
    expect(allowedUnits(UNIDADES, ['sul']).map((x) => x.id)).toEqual(['sul']);
    expect(allowedUnits(UNIDADES, ['norte']).map((x) => x.id)).toEqual(['centro']);
  });

  it('a escolhida vale se a pessoa pode; senão a primeira', () => {
    const minhas = allowedUnits(UNIDADES, []);
    expect(pickUnit(minhas, 'sul')?.id).toBe('sul');
    expect(pickUnit(minhas, 'norte')?.id).toBe('centro');
    expect(pickUnit(minhas, undefined)?.id).toBe('centro');
  });

  it('sem unidade conta como da principal', () => {
    expect(inUnit(null, 'centro', 'centro')).toBe(true);
    expect(inUnit(null, 'sul', 'centro')).toBe(false);
    expect(inUnit('sul', 'sul', 'centro')).toBe(true);
    expect(unitAppointmentWhere('centro', 'centro')).toEqual({ OR: [{ unitId: 'centro' }, { unitId: null }] });
    expect(unitAppointmentWhere('sul', 'centro')).toEqual({ unitId: 'sul' });
  });
});

describe('nome curto no seletor do topo', () => {
  it('tira as palavras que todas têm em comum no começo', () => {
    expect(shortUnitNames(['Odontologia Michele Herreira Suzano', 'Odontologia Michele Herreira Ferraz'])).toEqual(['Suzano', 'Ferraz']);
    expect(shortUnitNames(['Clínica Sorriso', 'Clínica Sorriso Zona Sul'])).toEqual(['Sorriso', 'Sorriso Zona Sul']);
    expect(shortUnitNames(['Centro', 'Zona Sul'])).toEqual(['Centro', 'Zona Sul']);
  });
});
