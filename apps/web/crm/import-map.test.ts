import { describe, expect, it } from 'vitest';
import { buildRecords, guessMapping, guessNewFieldType, guessTarget, importPhone, outcomeOf, parseImportDate, sourceOf } from './import-map';

const CAMPOS = [{ id: 'cv1', name: 'Convênio' }];

describe('reconhecer as colunas', () => {
  it('nomes do Kommo em português, inglês e espanhol', () => {
    expect(guessTarget('Título do lead', [])).toBe('title');
    expect(guessTarget('Contato principal', [])).toBe('name');
    expect(guessTarget('Telefone comercial', [])).toBe('phone');
    expect(guessTarget('Telefone (celular)', [])).toBe('phone');
    expect(guessTarget('Work email', [])).toBe('email');
    expect(guessTarget('Venda', [])).toBe('value');
    expect(guessTarget('Funil', [])).toBe('pipeline');
    expect(guessTarget('Etapa do lead', [])).toBe('stage');
    expect(guessTarget('Usuário responsável', [])).toBe('responsible');
    expect(guessTarget('Responsible user', [])).toBe('responsible');
    expect(guessTarget('Tags', [])).toBe('tags');
    expect(guessTarget('Criado em', [])).toBe('createdAt');
    expect(guessTarget('Fecha de cierre', [])).toBe('closedAt');
    expect(guessTarget('Motivo da perda', [])).toBe('lostReason');
  });

  it('campo personalizado com o mesmo nome; desconhecida vira campo novo; vazia é ignorada', () => {
    expect(guessTarget('convenio', CAMPOS)).toBe('field:cv1');
    expect(guessTarget('Como conheceu', CAMPOS)).toBe('newField');
    expect(guessTarget('  ', CAMPOS)).toBe('ignore');
  });

  it('o que só existe uma vez fica na primeira coluna; telefones podem ser vários', () => {
    expect(guessMapping(['Nome', 'Telefone comercial', 'Celular', 'Nome'], [])).toEqual(['name', 'phone', 'phone', 'ignore']);
  });
});

describe('ler os valores', () => {
  it.each([
    ['Venda ganha', 'won'],
    ['Closed - won', 'won'],
    ['Venda perdida', 'lost'],
    ['Closed - lost', 'lost'],
    ['Em negociação', null],
  ])('situação %s → %s', (t, esperado) => expect(outcomeOf(t)).toBe(esperado));

  it('datas do Kommo e do Excel, em horário de Brasília', () => {
    expect(parseImportDate('15.10.2026 14:32:10')).toBe('2026-10-15T17:32:10.000Z');
    expect(parseImportDate('15/10/2026')).toBe('2026-10-15T03:00:00.000Z');
    expect(parseImportDate('2026-10-15 09:00')).toBe('2026-10-15T12:00:00.000Z');
    expect(parseImportDate('2026-10-15T12:00:00.000Z')).toBe('2026-10-15T12:00:00.000Z');
    expect(parseImportDate('31/02/2026')).toBeNull();
    expect(parseImportDate('ontem')).toBeNull();
  });

  it('telefone brasileiro com ou sem 55, formatado ou não', () => {
    expect(importPhone('+55 (11) 98765-4321')).toBe('5511987654321');
    expect(importPhone('11 3333-4444')).toBe('551133334444');
    expect(importPhone('12345')).toBeNull();
  });

  it('origem', () => {
    expect(sourceOf('Instagram Ads')).toBe('INSTAGRAM');
    expect(sourceOf('WhatsApp')).toBe('WHATSAPP');
    expect(sourceOf('Formulário do site')).toBe('SITE');
    expect(sourceOf('Indicação da Ana')).toBe('INDICACAO');
    expect(sourceOf('Feira')).toBe('OUTRO');
    expect(sourceOf('')).toBeNull();
  });
});

describe('montar os leads da planilha', () => {
  const cab = ['Título do lead', 'Contato principal', 'Telefone comercial', 'Celular', 'Venda', 'Funil', 'Etapa do lead', 'Tags', 'Criado em', 'Nota', 'Como conheceu'];
  const mapa = guessMapping(cab, []);

  it('linha completa, ganho pela etapa, sem telefone vira problema', () => {
    const { records, problems } = buildRecords(
      [
        ['Implante', 'Ana Souza', '', '(11) 98765-4321', '2.500,00', 'Funil principal', 'Em negociação', 'implante, VIP', '15.10.2026 10:00', 'Quer começar em novembro', 'Instagram'],
        ['Clareamento', 'Bia Lima', '11 91234-5678', '', '900', 'Funil principal', 'Venda ganha', '', '', '', 'Indicação'],
        ['Botox', 'Carla', '', '', '', '', '', '', '', '', ''],
      ],
      mapa,
    );
    expect(problems).toEqual([{ line: 4, message: 'sem telefone' }]);
    expect(records[0]).toMatchObject({
      line: 2,
      title: 'Implante',
      name: 'Ana Souza',
      phone: '5511987654321',
      valueCents: 250000,
      pipeline: 'Funil principal',
      stage: 'Em negociação',
      outcome: 'open',
      tags: ['implante', 'vip'],
      createdAt: '2026-10-15T13:00:00.000Z',
      notes: ['Quer começar em novembro'],
      fields: { 'new:10': 'Instagram' },
    });
    expect(records[1]).toMatchObject({ outcome: 'won', stage: null, valueCents: 90000 });
  });

  it('coluna nova: lista se os valores se repetem; texto se não', () => {
    expect(guessNewFieldType(['Instagram', 'Google', 'instagram', 'Google'])).toEqual({ type: 'SELECT', options: ['Instagram', 'Google'] });
    expect(guessNewFieldType(['a', 'b', 'c'])).toEqual({ type: 'TEXT', options: [] });
  });
});
