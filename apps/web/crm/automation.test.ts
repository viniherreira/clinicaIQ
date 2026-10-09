import { describe, expect, it } from 'vitest';
import {
  planForEvent,
  TASK_ENVIAR_ORCAMENTO,
  TASK_FALTOU,
  TASK_REAGENDAR,
  TASK_RETOMAR,
  type AutomationContext,
  type ClinicEvent,
} from './automation';
import { clinicDateAt, clinicLocalToInstant, clinicNowWall, instantToClinicLocal } from './clock';
import { DEFAULT_STAGES } from './defaults';
import type { StageLike } from './pipeline';

const stages: StageLike[] = DEFAULT_STAGES.map((s, i) => ({ id: s.name, name: s.name, order: s.order, role: s.role }));

function ctx(stageId: string, over: Partial<AutomationContext> = {}, lead: Partial<AutomationContext['lead']> = {}) {
  return {
    stages,
    lead: { id: 'l1', stageId, wonAt: null, lostAt: null, ...lead },
    hasFutureAppointment: false,
    hasOpenQuote: false,
    wonByThisQuote: false,
    ...over,
  } satisfies AutomationContext;
}

const ev = {
  agendou: { type: 'appointment.created', patientId: 'p', appointmentId: 'a' },
  remarcou: { type: 'appointment.rescheduled', patientId: 'p', appointmentId: 'a' },
  cancelou: { type: 'appointment.cancelled', patientId: 'p', appointmentId: 'a' },
  faltou: { type: 'appointment.missed', patientId: 'p', appointmentId: 'a' },
  compareceu: { type: 'appointment.attended', patientId: 'p', appointmentId: 'a' },
  orcou: { type: 'quote.created', patientId: 'p', quoteId: 'q' },
  aprovou: { type: 'quote.accepted', patientId: 'p', quoteId: 'q', totalCents: 650_000 },
  reabriu: { type: 'quote.reopened', patientId: 'p', quoteId: 'q' },
  recusou: { type: 'quote.rejected', patientId: 'p', quoteId: 'q', reason: 'caro' },
  excluiu: { type: 'quote.deleted', patientId: 'p', quoteId: 'q' },
} satisfies Record<string, ClinicEvent>;

describe('avançar', () => {
  it.each([
    ['agendou em Novo → Avaliação agendada', 'Novo', ev.agendou, 'Avaliação agendada'],
    ['agendou em Em conversa → Avaliação agendada', 'Em conversa', ev.agendou, 'Avaliação agendada'],
    ['orçamento criado → Em negociação', 'Avaliação agendada', ev.orcou, 'Em negociação'],
    ['orçamento direto de Novo → Em negociação', 'Novo', ev.orcou, 'Em negociação'],
  ])('%s', (_, de, evento, para) => {
    expect(planForEvent(ctx(de), evento).moveTo).toBe(para);
  });

  it('não puxa para trás quem a recepção já pôs adiante', () => {
    expect(planForEvent(ctx('Em negociação'), ev.agendou).moveTo).toBeUndefined();
    expect(planForEvent(ctx('Avaliação agendada'), ev.agendou).moveTo).toBeUndefined();
  });

  it('aprovar fecha com o valor do orçamento', () => {
    expect(planForEvent(ctx('Em negociação'), ev.aprovou)).toEqual({ moveTo: 'Fechou', wonValueCents: 650_000, tasks: [] });
  });

  it('remarcar não mexe no card', () => {
    expect(planForEvent(ctx('Avaliação agendada'), ev.remarcou)).toEqual({ tasks: [] });
  });
});

describe('voltar no cancelamento e na falta', () => {
  it('cancelou: volta para Em conversa e cria "Reagendar avaliação"', () => {
    expect(planForEvent(ctx('Avaliação agendada'), ev.cancelou)).toEqual({
      moveTo: 'Em conversa',
      tasks: [{ text: TASK_REAGENDAR, inDays: 1 }],
    });
  });

  it('faltou: mesma coisa, com o texto da falta', () => {
    expect(planForEvent(ctx('Avaliação agendada'), ev.faltou).tasks).toEqual([{ text: TASK_FALTOU, inDays: 1 }]);
  });

  it('não volta se ainda há outro agendamento futuro', () => {
    expect(planForEvent(ctx('Avaliação agendada', { hasFutureAppointment: true }), ev.cancelou)).toEqual({ tasks: [] });
  });

  it('só volta a partir de Avaliação agendada', () => {
    expect(planForEvent(ctx('Em negociação'), ev.cancelou)).toEqual({ tasks: [] });
    expect(planForEvent(ctx('Novo'), ev.faltou)).toEqual({ tasks: [] });
  });
});

describe('tarefas automáticas', () => {
  it('compareceu sem orçamento em aberto: "Enviar orçamento"', () => {
    expect(planForEvent(ctx('Avaliação agendada'), ev.compareceu)).toEqual({ tasks: [{ text: TASK_ENVIAR_ORCAMENTO, inDays: 1 }] });
    expect(planForEvent(ctx('Avaliação agendada', { hasOpenQuote: true }), ev.compareceu)).toEqual({ tasks: [] });
  });

  it('recusado ou excluído sem outro em aberto: "Retomar negociação", sem perder o lead', () => {
    for (const e of [ev.recusou, ev.excluiu]) {
      const plano = planForEvent(ctx('Em negociação'), e);
      expect(plano).toEqual({ tasks: [{ text: TASK_RETOMAR, inDays: 1 }] });
      expect(plano.moveTo).toBeUndefined();
    }
    expect(planForEvent(ctx('Em negociação', { hasOpenQuote: true }), ev.recusou)).toEqual({ tasks: [] });
  });
});

describe('lead fechado', () => {
  const ganho = { wonAt: new Date(), lostAt: null };
  const perdido = { wonAt: null, lostAt: new Date() };

  it('ganho ou perdido não é mexido por nenhum evento comum', () => {
    for (const e of Object.values(ev).filter((e) => e.type !== 'quote.reopened')) {
      expect(planForEvent(ctx('Fechou', {}, ganho), e)).toEqual({ tasks: [] });
      expect(planForEvent(ctx('Perdeu', {}, perdido), e)).toEqual({ tasks: [] });
    }
  });

  it('reabrir o orçamento que ganhou o lead devolve para Em negociação', () => {
    expect(planForEvent(ctx('Fechou', { wonByThisQuote: true }, ganho), ev.reabriu).moveTo).toBe('Em negociação');
  });

  it('reabrir outro orçamento não mexe no lead ganho', () => {
    expect(planForEvent(ctx('Fechou', { wonByThisQuote: false }, ganho), ev.reabriu)).toEqual({ tasks: [] });
  });

  it('nunca perde sozinho', () => {
    for (const e of Object.values(ev)) {
      const plano = planForEvent(ctx('Em negociação'), e);
      expect(plano.moveTo).not.toBe('Perdeu');
    }
  });
});

describe('relógio da clínica', () => {
  it('"amanhã às 10h" é 13:00Z em São Paulo (UTC-3)', () => {
    const agora = new Date('2026-10-08T23:30:00Z'); // 20:30 em São Paulo, ainda dia 8
    expect(clinicDateAt(1, 10, agora).toISOString()).toBe('2026-10-09T13:00:00.000Z');
  });

  it('a virada do dia segue São Paulo, não o UTC', () => {
    const agora = new Date('2026-10-09T02:30:00Z'); // 23:30 do dia 8 em São Paulo
    expect(clinicDateAt(1, 10, agora).toISOString()).toBe('2026-10-09T13:00:00.000Z');
  });

  it('agora em hora de parede, no formato da agenda', () => {
    expect(clinicNowWall(new Date('2026-10-08T23:30:00Z')).toISOString()).toBe('2026-10-08T20:30:00.000Z');
  });

  it('campo de data e hora da tela, no horário da clínica', () => {
    expect(clinicLocalToInstant('2026-10-10T10:00')?.toISOString()).toBe('2026-10-10T13:00:00.000Z');
    expect(instantToClinicLocal(new Date('2026-10-10T13:00:00Z'))).toBe('2026-10-10T10:00');
    expect(clinicLocalToInstant('ontem')).toBeNull();
  });
});
