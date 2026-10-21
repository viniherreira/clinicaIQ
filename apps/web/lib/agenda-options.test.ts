import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENDA_BUTTONS,
  agendaButtonsOr,
  checkAgendaButtons,
  previewAgendaText,
  readAgendaButtons,
  readReminderDays,
  sameButtons,
} from './agenda-options';

describe('botões dos avisos da agenda', () => {
  it('sem escolha, Confirmar e Reagendar', () => {
    expect(DEFAULT_AGENDA_BUTTONS).toEqual([
      { payload: 'confirm', text: 'Confirmar' },
      { payload: 'reschedule', text: 'Reagendar' },
    ]);
    expect(agendaButtonsOr(null)).toEqual(DEFAULT_AGENDA_BUTTONS);
    expect(agendaButtonsOr([{ payload: 'apagar', text: 'x' }])).toEqual(DEFAULT_AGENDA_BUTTONS);
  });

  it('lê o que foi salvo, inclusive nenhum botão', () => {
    expect(readAgendaButtons([{ payload: 'cancel', text: 'Desmarcar' }])).toEqual([{ payload: 'cancel', text: 'Desmarcar' }]);
    expect(readAgendaButtons([])).toEqual([]);
    expect(readAgendaButtons('confirm')).toBeNull();
  });

  it('confere e põe na ordem da mensagem, com o nome limpo', () => {
    expect(
      checkAgendaButtons([
        { payload: 'cancel', text: '  Não vou  poder ' },
        { payload: 'confirm', text: 'Vou sim' },
      ]),
    ).toEqual({
      ok: true,
      buttons: [
        { payload: 'confirm', text: 'Vou sim' },
        { payload: 'cancel', text: 'Não vou poder' },
      ],
    });
  });

  it.each([
    [[{ payload: 'confirm', text: ' ' }], 'Escreva o nome'],
    [[{ payload: 'confirm', text: 'x'.repeat(26) }], 'passa de 25'],
    [[{ payload: 'confirm', text: 'Ok' }, { payload: 'cancel', text: 'ok' }], 'mesmo nome'],
    [[{ payload: 'confirm', text: 'A' }, { payload: 'confirm', text: 'B' }], 'repetido'],
  ] as const)('recusa %j', (lista, msg) => {
    const r = checkAgendaButtons(lista.map((b) => ({ ...b })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(msg);
  });

  it('compara texto e ordem', () => {
    expect(sameButtons(DEFAULT_AGENDA_BUTTONS, [...DEFAULT_AGENDA_BUTTONS])).toBe(true);
    expect(sameButtons(DEFAULT_AGENDA_BUTTONS, [{ payload: 'confirm', text: 'Confirmar' }])).toBe(false);
    expect(sameButtons(DEFAULT_AGENDA_BUTTONS, [{ payload: 'confirm', text: 'Sim' }, DEFAULT_AGENDA_BUTTONS[1]])).toBe(false);
  });
});

describe('dias do lembrete', () => {
  it('só os dias que existem, sem repetir, do mais longe ao mais perto', () => {
    expect(readReminderDays([1, 7, 1, 0, 5, -1, 'x'])).toEqual([7, 1, 0]);
    expect(readReminderDays([])).toEqual([]);
    expect(readReminderDays(null)).toEqual([1]);
  });
});

it('prévia com um paciente de exemplo', () => {
  expect(previewAgendaText('Olá, {nome}! {Data} às {hora}.')).toBe('Olá, Ana! quinta-feira, 28/05 às 14:30.');
});
