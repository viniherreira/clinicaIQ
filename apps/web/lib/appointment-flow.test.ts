import { describe, expect, it } from 'vitest';
import { actionsFor, applyAction, stageOf, waitingMinutes, type FlowAction, type FlowLike, type Stage } from './appointment-flow';

const agora = new Date('2026-10-12T13:00:00Z');
const antes = new Date('2026-10-12T12:40:00Z');

describe('stageOf', () => {
  it.each<[FlowLike, Stage]>([
    [{ status: 'SCHEDULED' }, 'SCHEDULED'],
    [{ status: 'CONFIRMED' }, 'CONFIRMED'],
    [{ status: 'CONFIRMED', arrivedAt: antes }, 'ARRIVED'],
    [{ status: 'SCHEDULED', arrivedAt: antes, startedAt: agora }, 'IN_PROGRESS'],
    [{ status: 'ATTENDED', arrivedAt: antes, startedAt: agora }, 'ATTENDED'],
    [{ status: 'MISSED' }, 'MISSED'],
    [{ status: 'CANCELLED', arrivedAt: antes }, 'CANCELLED'],
    [{ status: 'RESCHEDULED' }, 'RESCHEDULED'],
  ])('%j → %s', (a, esperado) => expect(stageOf(a)).toBe(esperado));
});

describe('actionsFor: a ação principal vem primeiro', () => {
  it.each<[Stage, FlowAction]>([
    ['SCHEDULED', 'arrive'],
    ['CONFIRMED', 'arrive'],
    ['ARRIVED', 'start'],
    ['IN_PROGRESS', 'finish'],
    ['ATTENDED', 'reopen'],
    ['MISSED', 'reopen'],
  ])('%s → %s', (stage, principal) => expect(actionsFor(stage)[0]).toBe(principal));

  it('não se confirma quem já confirmou nem se finaliza quem nem chegou', () => {
    expect(actionsFor('CONFIRMED')).not.toContain('confirm');
    expect(actionsFor('SCHEDULED')).not.toContain('finish');
    expect(actionsFor('ARRIVED')).not.toContain('miss');
  });

  it('quem faltou ainda pode ser cancelado', () => {
    expect(actionsFor('MISSED')).toEqual(['reopen', 'cancel']);
  });
});

describe('applyAction', () => {
  it('chegou só marca a hora; a situação continua a mesma', () => {
    expect(applyAction({ status: 'CONFIRMED' }, 'arrive', agora)).toEqual({ arrivedAt: agora });
  });

  it('iniciar sem ter marcado a chegada marca as duas horas', () => {
    expect(applyAction({ status: 'SCHEDULED', arrivedAt: antes }, 'start', agora)).toEqual({ startedAt: agora });
    expect(applyAction({ status: 'SCHEDULED' }, 'start', agora)).toBeNull();
  });

  it('finalizar vira atendido com a hora de fim', () => {
    expect(applyAction({ status: 'CONFIRMED', arrivedAt: antes, startedAt: antes }, 'finish', agora)).toEqual({
      status: 'ATTENDED',
      finishedAt: agora,
    });
  });

  it('faltou, cancelar e reabrir limpam as horas do dia', () => {
    const limpo = { arrivedAt: null, startedAt: null, finishedAt: null };
    expect(applyAction({ status: 'SCHEDULED' }, 'miss', agora)).toEqual({ status: 'MISSED', ...limpo });
    expect(applyAction({ status: 'CONFIRMED', arrivedAt: antes }, 'cancel', agora)).toEqual({ status: 'CANCELLED', ...limpo });
    expect(applyAction({ status: 'ATTENDED', arrivedAt: antes, startedAt: antes }, 'reopen', agora)).toEqual({ status: 'SCHEDULED', ...limpo });
  });

  it('ação fora de hora não grava nada', () => {
    expect(applyAction({ status: 'ATTENDED' }, 'arrive', agora)).toBeNull();
    expect(applyAction({ status: 'CONFIRMED' }, 'confirm', agora)).toBeNull();
  });
});

describe('waitingMinutes', () => {
  it.each([
    [{}, null],
    [{ arrivedAt: antes }, 20],
    [{ arrivedAt: antes, startedAt: new Date('2026-10-12T12:45:30Z') }, 5],
  ])('%j → %s', (a, esperado) => expect(waitingMinutes(a, agora)).toBe(esperado));
});
