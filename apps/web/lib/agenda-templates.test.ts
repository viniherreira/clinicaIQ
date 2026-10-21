import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENDA_TEXT,
  agendaParams,
  agendaTemplateName,
  agendaTemplateVersion,
  agendaText,
  fillMetaBody,
  readVarKeys,
  toMetaTemplate,
} from './agenda-templates';

const dados = {
  patientName: 'Maria Aparecida Souza',
  clinicName: 'Clínica Sorriso',
  professionalName: 'Dra. Paula',
  procedureName: null,
  dateLabel: 'quinta-feira, 28/05',
  timeLabel: '14:30',
};

describe('toMetaTemplate', () => {
  it.each([
    ['uma variável', 'Olá {nome}, tudo bem?', 'Olá {{1}}, tudo bem?', ['nome']],
    ['na ordem em que aparecem', 'Dia {data} às {hora} com {nome}.', 'Dia {{1}} às {{2}} com {{3}}.', ['data', 'hora', 'nome']],
    ['repetida ganha outro número', 'Oi {nome}! Até {data}, {nome}.', 'Oi {{1}}! Até {{2}}, {{3}}.', ['nome', 'data', 'nome']],
    ['maiúscula vale', 'Oi {Nome}, até logo.', 'Oi {{1}}, até logo.', ['nome']],
    ['chave desconhecida fica como está', 'Oi {apelido}, até logo.', 'Oi {apelido}, até logo.', []],
    ['linhas em branco demais viram uma', 'Oi {nome}.\n\n\n\nTchau.', 'Oi {{1}}.\n\nTchau.', ['nome']],
  ])('%s', (_, texto, body, keys) => {
    const r = toMetaTemplate(texto);
    expect(r).toMatchObject({ ok: true, body, varKeys: keys });
    if (r.ok) expect(r.examples).toHaveLength(keys.length);
  });

  it.each([
    ['vazio', '   ', 'Escreva'],
    ['começa com variável', '{nome}, sua consulta é amanhã.', 'começar nem terminar'],
    ['termina com variável', 'Sua consulta é às {hora}', 'começar nem terminar'],
    ['variáveis coladas', 'Consulta {data} {hora} confirmada.', 'entre duas variáveis'],
    ['longo demais', `Oi {nome}. ${'a'.repeat(1100)}`, '1024'],
  ])('recusa: %s', (_, texto, trecho) => {
    const r = toMetaTemplate(texto);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(trecho);
  });

  it('os textos padrão passam nas regras da Meta', () => {
    for (const t of Object.values(DEFAULT_AGENDA_TEXT)) {
      expect(t).toContain('{nome}');
      expect(toMetaTemplate(t).ok).toBe(true);
    }
  });
});

describe('agendaParams e fillMetaBody', () => {
  it('primeiro nome, "consulta" sem procedimento e nada de quebra de linha', () => {
    const p = agendaParams(['nome', 'procedimento', 'clinica'], { ...dados, clinicName: 'Clínica\nSorriso' });
    expect(p).toEqual(['Maria', 'consulta', 'Clínica Sorriso']);
  });

  it('com procedimento, vai o nome dele', () => {
    expect(agendaParams(['procedimento'], { ...dados, procedureName: 'Limpeza' })).toEqual(['Limpeza']);
  });

  it('o padrão preenchido é o que o paciente lê', () => {
    const r = toMetaTemplate(DEFAULT_AGENDA_TEXT.APPOINTMENT_REMINDER);
    if (!r.ok) throw new Error(r.message);
    const texto = fillMetaBody(r.body, agendaParams(r.varKeys, dados));
    expect(texto).toContain('Olá, Maria!');
    expect(texto).toContain('quinta-feira, 28/05 às 14:30');
    expect(texto).not.toMatch(/\{\{\d+\}\}/);
  });
});

describe('nomes, versões e leitura', () => {
  it('nome com versão e volta', () => {
    expect(agendaTemplateName('APPOINTMENT_REMINDER', 3)).toBe('dc_lembrete_3');
    expect(agendaTemplateVersion('APPOINTMENT_REMINDER', 'dc_lembrete_3')).toBe(3);
    expect(agendaTemplateVersion('APPOINTMENT_REMINDER', 'dc_agendamento_3')).toBeNull();
    expect(agendaTemplateVersion('APPOINTMENT_CREATED', 'retomar_contato')).toBeNull();
  });

  it('texto vazio é o padrão', () => {
    expect(agendaText('APPOINTMENT_CREATED', '  ')).toBe(DEFAULT_AGENDA_TEXT.APPOINTMENT_CREATED);
    expect(agendaText('APPOINTMENT_CREATED', ' Oi {nome}. ')).toBe('Oi {nome}.');
  });

  it('varKeys do banco', () => {
    expect(readVarKeys(['nome', 'data'])).toEqual(['nome', 'data']);
    expect(readVarKeys(['nome', 'cpf'])).toBeNull();
    expect(readVarKeys(null)).toBeNull();
  });
});

describe('convite para os botões', () => {
  it('o texto padrão aponta para os botões, sem "responda 1 ou 2"', () => {
    for (const t of Object.values(DEFAULT_AGENDA_TEXT)) {
      expect(t).toContain('Toque em *Confirmar* ou *Reagendar*');
      expect(t).not.toMatch(/\*1\*|\*2\*/);
    }
  });

  it('texto salvo com o convite antigo passa a apontar para os botões', () => {
    const salvo = 'Olá, {nome}!\nPodemos confirmar sua presença?\nResponda *1* para confirmar ou *2* para reagendar.';
    expect(agendaText('APPOINTMENT_REMINDER', salvo)).toBe(
      'Olá, {nome}!\nPodemos confirmar sua presença?\nToque em *Confirmar* ou *Reagendar* aqui embaixo.',
    );
  });
});
