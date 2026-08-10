import { describe, expect, it } from 'vitest';
import { renderAppointmentTemplate, type AppointmentMessageData } from './templates';

const base: AppointmentMessageData = {
  patientName: 'Maria Aparecida Souza',
  clinicName: 'Odonto Sorriso',
  professionalName: 'Dra. Michele',
  procedureName: 'Limpeza',
  dateLabel: 'quinta-feira, 28/05',
  timeLabel: '14:30',
};

describe('renderAppointmentTemplate', () => {
  it('substitui todas as variáveis oferecidas', () => {
    const texto = '{nome}, {clinica}, {data}, {hora}, {profissional}, {procedimento}';
    // O espaço antes de {procedimento} é consumido junto com o separador — é o
    // mesmo mecanismo que evita " - " órfão quando não há procedimento.
    expect(renderAppointmentTemplate(texto, base)).toBe(
      'Maria, Odonto Sorriso, quinta-feira, 28/05, 14:30, Dra. Michele, Limpeza',
    );
  });

  it('usa só o primeiro nome — cabe melhor no balão', () => {
    expect(renderAppointmentTemplate('Olá, {nome}!', base)).toBe('Olá, Maria!');
  });

  it('não deixa separador órfão quando não há procedimento', () => {
    // O que isso trava: "com Dra. Michele - " chegando ao paciente.
    const semProc = { ...base, procedureName: null };
    expect(renderAppointmentTemplate('com {profissional} - {procedimento}', semProc)).toBe(
      'com Dra. Michele',
    );
    expect(renderAppointmentTemplate('{profissional} · {procedimento}', semProc)).toBe(
      'Dra. Michele',
    );
  });

  it('aceita procedimento vazio como se não existisse', () => {
    const vazio = { ...base, procedureName: '   ' };
    expect(renderAppointmentTemplate('{profissional} — {procedimento}', vazio)).toBe(
      'Dra. Michele',
    );
  });

  it('não é sensível a maiúsculas', () => {
    expect(renderAppointmentTemplate('{NOME} na {Clinica}', base)).toBe('Maria na Odonto Sorriso');
  });

  it('deixa variável desconhecida visível em vez de apagar', () => {
    // Apagar em silêncio faria a clínica mandar uma frase quebrada sem entender
    // por quê. Melhor ela ver {telefone} literal e corrigir.
    expect(renderAppointmentTemplate('Ligue para {telefone}', base)).toBe(
      'Ligue para {telefone}',
    );
  });

  it('preserva quebras de linha e remove espaço nas pontas', () => {
    expect(renderAppointmentTemplate('  Linha 1\nLinha 2  ', base)).toBe('Linha 1\nLinha 2');
  });

  it('substitui a mesma variável várias vezes', () => {
    expect(renderAppointmentTemplate('{nome}, {nome}!', base)).toBe('Maria, Maria!');
  });
});
