import { describe, expect, it } from 'vitest';
import {
  cleanOptions,
  fieldFilterWhere,
  formatFieldValue,
  parseDate,
  parseFieldInput,
  parseNumber,
  readFieldValues,
  sameValue,
  type FieldDef,
} from './custom-fields';

const def = (type: FieldDef['type'], options: string[] = []): FieldDef => ({ id: 'f1', name: 'Campo', type, options, showOnCard: false, active: true });
const CONVENIO = def('SELECT', ['Amil', 'Unimed', 'Particular']);
const INTERESSES = def('MULTISELECT', ['Implante', 'Clareamento', 'Harmonização']);

describe('ler valores', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234.56', 1234.56],
    ['R$ 2.500', 2500],
    ['2.500', 2500],
    ['12', 12],
    [7.5, 7.5],
    ['abc', null],
    ['', null],
  ])('número %s → %s', (raw, esperado) => expect(parseNumber(raw)).toBe(esperado));

  it.each([
    ['2026-10-16', '2026-10-16'],
    ['16/10/2026', '2026-10-16'],
    ['1/2/26', '2026-02-01'],
    ['31/02/2026', null],
    ['ontem', null],
  ])('data %s → %s', (raw, esperado) => expect(parseDate(raw)).toBe(esperado));
});

describe('validar o que a pessoa mandou', () => {
  it('vazio apaga o valor', () => {
    expect(parseFieldInput(CONVENIO, '')).toEqual({ ok: true, value: null });
    expect(parseFieldInput(INTERESSES, [])).toEqual({ ok: true, value: null });
  });

  it('opção casa sem acento e maiúscula e guarda o nome certo', () => {
    expect(parseFieldInput(CONVENIO, 'unimed')).toEqual({ ok: true, value: 'Unimed' });
    expect(parseFieldInput(CONVENIO, 'Bradesco')).toMatchObject({ ok: false });
  });

  it('várias opções: por vírgula ou lista, sem repetir', () => {
    expect(parseFieldInput(INTERESSES, 'implante, HARMONIZACAO, Implante')).toEqual({ ok: true, value: ['Implante', 'Harmonização'] });
    expect(parseFieldInput(INTERESSES, ['Clareamento'])).toEqual({ ok: true, value: ['Clareamento'] });
    expect(parseFieldInput(INTERESSES, 'Botox')).toMatchObject({ ok: false });
  });

  it('número, data, sim/não e texto', () => {
    expect(parseFieldInput(def('NUMBER'), '3,5')).toEqual({ ok: true, value: 3.5 });
    expect(parseFieldInput(def('NUMBER'), 'muito')).toMatchObject({ ok: false });
    expect(parseFieldInput(def('DATE'), '05/11/2026')).toEqual({ ok: true, value: '2026-11-05' });
    expect(parseFieldInput(def('BOOLEAN'), 'Não')).toEqual({ ok: true, value: false });
    expect(parseFieldInput(def('BOOLEAN'), 'talvez')).toMatchObject({ ok: false });
    expect(parseFieldInput(def('TEXT'), '  Indicação da Ana  ')).toEqual({ ok: true, value: 'Indicação da Ana' });
  });
});

describe('mostrar e comparar', () => {
  it('formata para a tela e a planilha', () => {
    expect(formatFieldValue(def('NUMBER'), 1234.5)).toBe('1.234,5');
    expect(formatFieldValue(def('DATE'), '2026-10-16')).toBe('16/10/2026');
    expect(formatFieldValue(def('BOOLEAN'), true)).toBe('Sim');
    expect(formatFieldValue(INTERESSES, ['Implante', 'Clareamento'])).toBe('Implante, Clareamento');
    expect(formatFieldValue(CONVENIO, undefined)).toBe('');
  });

  it('valor igual não vira histórico', () => {
    expect(sameValue(['a'], ['a'])).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue('Amil', 'Unimed')).toBe(false);
  });

  it('o JSON do banco: fica só o que é valor', () => {
    expect(readFieldValues({ a: 'x', b: 2, c: true, d: ['y'], e: { z: 1 }, f: [1] })).toEqual({ a: 'x', b: 2, c: true, d: ['y'] });
    expect(readFieldValues(null)).toEqual({});
  });

  it('opções limpas', () => {
    expect(cleanOptions([' Amil ', 'amil', 'Unimed', '', 'Particular'])).toEqual(['Amil', 'Unimed', 'Particular']);
  });
});

describe('filtro do Prisma', () => {
  it('lista, várias opções e sim/não', () => {
    expect(fieldFilterWhere(CONVENIO, 'amil')).toEqual({ fields: { path: ['f1'], equals: 'Amil' } });
    expect(fieldFilterWhere(INTERESSES, 'Implante')).toEqual({ fields: { path: ['f1'], array_contains: ['Implante'] } });
    expect(fieldFilterWhere(def('BOOLEAN'), 'sim')).toEqual({ fields: { path: ['f1'], equals: true } });
    expect(fieldFilterWhere(CONVENIO, 'Outro')).toBeNull();
  });
});
