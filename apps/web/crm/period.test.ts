import { describe, expect, it } from 'vitest';
import {
  addDays,
  clinicDay,
  isDay,
  matchingPreset,
  monthEnd,
  NO_PERIOD,
  parsePeriod,
  periodLabel,
  periodParams,
  periodWhere,
  presetRange,
  rangeText,
  rangeWhere,
  resolvePeriod,
} from './period';

describe('dias', () => {
  it('só aceita dia que existe', () => {
    expect(isDay('2026-10-15')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('15/10/2026')).toBe(false);
    expect(isDay('2026-10-15T00:00')).toBe(false);
  });

  it('soma dias atravessando mês e ano; fim do mês com fevereiro bissexto', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
  });

  it('hoje é o dia de Brasília, não o de Greenwich', () => {
    // 15/10 às 01:00 UTC ainda é 14/10 às 22:00 em Brasília.
    expect(clinicDay(new Date('2026-10-15T01:00:00Z'))).toBe('2026-10-14');
  });
});

describe('atalhos', () => {
  const hoje = '2026-10-15';

  it('cada atalho dá os dias certos, contando hoje', () => {
    expect(presetRange('hoje', hoje)).toEqual({ from: hoje, to: hoje });
    expect(presetRange('ontem', hoje)).toEqual({ from: '2026-10-14', to: '2026-10-14' });
    expect(presetRange('7d', hoje)).toEqual({ from: '2026-10-09', to: hoje });
    expect(presetRange('30d', hoje)).toEqual({ from: '2026-09-16', to: hoje });
    expect(presetRange('mes', hoje)).toEqual({ from: '2026-10-01', to: hoje });
    expect(presetRange('mes-passado', hoje)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('ano', hoje)).toEqual({ from: '2026-01-01', to: hoje });
  });

  it('mês passado em janeiro é dezembro do ano anterior', () => {
    expect(presetRange('mes-passado', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('reconhece o atalho a partir dos dias, para marcar o botão', () => {
    expect(matchingPreset('2026-10-09', hoje, hoje)).toBe('7d');
    expect(matchingPreset('2026-10-01', '2026-10-15', hoje)).toBe('mes');
    expect(matchingPreset('2026-10-02', '2026-10-15', hoje)).toBe('');
    expect(matchingPreset('2026-10-02', '', hoje)).toBe('');
  });
});

describe('parsePeriod (URL)', () => {
  it('sem nada: sem período', () => {
    expect(parsePeriod({})).toEqual(NO_PERIOD);
  });

  it('atalho, dias do calendário e data de fechamento', () => {
    expect(parsePeriod({ periodo: '30d' })).toEqual({ field: 'criado', preset: '30d', from: '', to: '' });
    expect(parsePeriod({ de: '2026-10-01', ate: '2026-10-15', data: 'fechado' })).toEqual({
      field: 'fechado',
      preset: '',
      from: '2026-10-01',
      to: '2026-10-15',
    });
  });

  it('o "criado=7d" dos links antigos continua valendo', () => {
    expect(parsePeriod({ criado: '7d' }).preset).toBe('7d');
    expect(parsePeriod({ criado: 'ontem' }).preset).toBe('');
  });

  it('descarta o que não é dia nem atalho; "fechado" sem período não fica', () => {
    expect(parsePeriod({ periodo: 'sempre', de: '2026-02-31', ate: '<script>' })).toEqual(NO_PERIOD);
    expect(parsePeriod({ data: 'fechado' })).toEqual(NO_PERIOD);
  });

  it('atalho manda: com ele, os dias do calendário são ignorados', () => {
    expect(parsePeriod({ periodo: 'hoje', de: '2026-01-01' })).toEqual({ field: 'criado', preset: 'hoje', from: '', to: '' });
  });

  it('ida e volta pela URL', () => {
    const p = { field: 'fechado' as const, preset: '' as const, from: '2026-10-01', to: '2026-10-15' };
    expect(parsePeriod(periodParams(p))).toEqual(p);
    expect(periodParams(NO_PERIOD)).toEqual({ periodo: '', de: '', ate: '', data: '' });
  });
});

describe('textos', () => {
  it('período do calendário encurta o ano repetido', () => {
    expect(rangeText('2026-10-01', '2026-10-15')).toBe('01/10 a 15/10/2026');
    expect(rangeText('2025-12-28', '2026-01-05')).toBe('28/12/2025 a 05/01/2026');
    expect(rangeText('2026-10-01', '2026-10-01')).toBe('01/10/2026');
    expect(rangeText('2026-10-01', '')).toBe('desde 01/10/2026');
    expect(rangeText('', '2026-10-15')).toBe('até 15/10/2026');
  });

  it('o rótulo diz qual data conta', () => {
    expect(periodLabel({ field: 'criado', preset: '7d', from: '', to: '' })).toBe('Criados: últimos 7 dias');
    expect(periodLabel({ field: 'fechado', preset: '', from: '2026-10-15', to: '2026-10-01' })).toBe('Fechados: 01/10 a 15/10/2026');
    expect(periodLabel(NO_PERIOD)).toBe('');
  });
});

describe('filtro de banco', () => {
  it('criados: do começo do primeiro dia ao fim do último, em Brasília', () => {
    expect(rangeWhere('criado', '2026-10-01', '2026-10-15')).toEqual({
      createdAt: { gte: new Date('2026-10-01T03:00:00.000Z'), lte: new Date('2026-10-16T02:59:59.999Z') },
    });
  });

  it('fechados: ganhos ou perdidos naqueles dias', () => {
    const range = { gte: new Date('2026-10-01T03:00:00.000Z') };
    expect(rangeWhere('fechado', '2026-10-01', '')).toEqual({ OR: [{ wonAt: range }, { lostAt: range }] });
  });

  it('sem dias, sem filtro; período ao contrário é desvirado', () => {
    expect(rangeWhere('criado', '', '')).toBeNull();
    expect(periodWhere(NO_PERIOD, '2026-10-15')).toBeNull();
    expect(resolvePeriod({ field: 'criado', preset: '', from: '2026-10-15', to: '2026-10-01' }, '2026-10-20')).toEqual({
      from: '2026-10-01',
      to: '2026-10-15',
    });
  });

  it('atalho é resolvido no dia de hoje', () => {
    expect(periodWhere({ field: 'criado', preset: 'hoje', from: '', to: '' }, '2026-10-15')).toEqual({
      createdAt: { gte: new Date('2026-10-15T03:00:00.000Z'), lte: new Date('2026-10-16T02:59:59.999Z') },
    });
  });
});
