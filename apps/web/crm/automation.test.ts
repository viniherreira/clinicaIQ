import { describe, expect, it } from 'vitest';
import {
  planForEvent,
  TASK_ENVIAR_ORCAMENTO,
  TASK_FALTOU,
  TASK_REAGENDAR,
  TASK_RETOMAR,
  withOldTaskTexts,
  type AutomationContext,
  type ClinicEvent,
} from './automation';
import { clinicDateAt, clinicLocalToInstant, clinicNowWall, instantToClinicLocal } from './clock';
import { DEFAULT_PIPELINES, DEFAULT_STAGES } from './defaults';
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
  aprovou: { type: 'quote.accepted', patientId: 'p', quoteId: 'q' },
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
    expect(planForEvent(ctx('Em negociação', { quoteTotalCents: 650_000 }), ev.aprovou)).toMatchObject({ moveTo: 'Fechou', wonValueCents: 650_000, tasks: [] });
  });

  it('fazer o que a tarefa automática pedia conclui a tarefa', () => {
    expect(planForEvent(ctx('Em conversa'), ev.agendou).completes).toEqual([TASK_REAGENDAR, TASK_FALTOU]);
    expect(planForEvent(ctx('Avaliação agendada'), ev.orcou).completes).toEqual([TASK_ENVIAR_ORCAMENTO, TASK_RETOMAR]);
    expect(planForEvent(ctx('Em negociação'), ev.aprovou).completes).toContain(TASK_RETOMAR);
  });

  it('remarcar não mexe no card', () => {
    expect(planForEvent(ctx('Avaliação agendada'), ev.remarcou)).toEqual({ tasks: [] });
  });
});

describe('voltar no cancelamento e na falta', () => {
  it('cancelou: vai para Desmarcou e cria "Reagendar avaliação"', () => {
    expect(planForEvent(ctx('Avaliação agendada'), ev.cancelou)).toEqual({
      moveTo: 'Desmarcou',
      tasks: [{ text: TASK_REAGENDAR, inDays: 1 }],
    });
  });

  it('faltou: também vai para Desmarcou', () => {
    expect(planForEvent(ctx('Avaliação agendada'), ev.faltou).moveTo).toBe('Desmarcou');
  });

  it('agendou de novo: sai de Desmarcou e volta para Avaliação agendada', () => {
    expect(planForEvent(ctx('Desmarcou'), ev.agendou)).toEqual({
      moveTo: 'Avaliação agendada',
      tasks: [],
      completes: [TASK_REAGENDAR, TASK_FALTOU],
    });
  });

  it('funil sem Desmarcou: volta uma coluna, como antes', () => {
    const antigo = stages.filter((s) => s.role !== 'CANCELLED');
    expect(planForEvent({ ...ctx('Avaliação agendada'), stages: antigo }, ev.cancelou).moveTo).toBe('Em conversa');
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
    const veio = { tasks: [{ text: TASK_ENVIAR_ORCAMENTO, inDays: 1 }], completes: [TASK_REAGENDAR, TASK_FALTOU] };
    expect(planForEvent(ctx('Avaliação agendada'), ev.compareceu)).toEqual(veio);
    expect(planForEvent(ctx('Avaliação agendada', { hasOpenQuote: true }), ev.compareceu)).toEqual({ ...veio, tasks: [] });
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

describe('dois funis: Captação → Agendados', () => {
  // Ids "Funil/Etapa": os dois funis têm "Fechou" e "Perdeu".
  const dois: StageLike[] = DEFAULT_PIPELINES.flatMap((p) =>
    p.stages.map((s) => ({ id: `${p.name}/${s.name}`, name: s.name, order: s.order, role: s.role, pipelineId: p.name })),
  );
  const em = (stageId: string, over: Partial<AutomationContext> = {}, lead: Partial<AutomationContext['lead']> = {}) =>
    ctx(stageId, { stages: dois, ...over }, lead);

  it('agendou na Captação: passa para Agendados', () => {
    expect(planForEvent(em('Captação/Novo'), ev.agendou).moveTo).toBe('Agendados/Avaliação agendada');
    expect(planForEvent(em('Captação/Em conversa'), ev.agendou).moveTo).toBe('Agendados/Avaliação agendada');
  });

  it('orçamento direto da Captação: vai para Agendados › Em negociação', () => {
    expect(planForEvent(em('Captação/Em conversa'), ev.orcou).moveTo).toBe('Agendados/Em negociação');
  });

  it('dentro de Agendados, só para frente', () => {
    expect(planForEvent(em('Agendados/Em negociação'), ev.agendou).moveTo).toBeUndefined();
    expect(planForEvent(em('Agendados/Compareceu'), ev.agendou).moveTo).toBeUndefined();
    expect(planForEvent(em('Agendados/Avaliação agendada'), ev.orcou).moveTo).toBe('Agendados/Em negociação');
  });

  it('desmarcou e faltou: "Desmarcou ou faltou"; agendou de novo volta', () => {
    expect(planForEvent(em('Agendados/Avaliação agendada'), ev.cancelou).moveTo).toBe('Agendados/Desmarcou ou faltou');
    expect(planForEvent(em('Agendados/Avaliação agendada'), ev.faltou).moveTo).toBe('Agendados/Desmarcou ou faltou');
    expect(planForEvent(em('Agendados/Desmarcou ou faltou'), ev.agendou).moveTo).toBe('Agendados/Avaliação agendada');
  });

  it('compareceu: vai para Compareceu, até de quem tinha desmarcado', () => {
    expect(planForEvent(em('Agendados/Avaliação agendada'), ev.compareceu).moveTo).toBe('Agendados/Compareceu');
    expect(planForEvent(em('Agendados/Desmarcou ou faltou'), ev.compareceu).moveTo).toBe('Agendados/Compareceu');
    expect(planForEvent(em('Agendados/Em negociação'), ev.compareceu).moveTo).toBeUndefined();
  });

  it('aprovou: o Fechou do funil em que o card está', () => {
    expect(planForEvent(em('Agendados/Em negociação'), ev.aprovou).moveTo).toBe('Agendados/Fechou');
    expect(planForEvent(em('Captação/Em conversa'), ev.aprovou).moveTo).toBe('Captação/Fechou');
  });

  it('o card de um funil da clínica sem etapas da agenda também passa para Agendados', () => {
    const comOutro = [...dois, { id: 'Implantes/Novo', name: 'Novo', order: 10, role: 'NEW' as const, pipelineId: 'Implantes' }];
    expect(planForEvent(em('Implantes/Novo', { stages: comOutro }), ev.agendou).moveTo).toBe('Agendados/Avaliação agendada');
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

describe('withOldTaskTexts', () => {
  it('conclui também a tarefa aberta com o texto antigo, de antes da troca do travessão', () => {
    expect(withOldTaskTexts([TASK_REAGENDAR, TASK_FALTOU])).toEqual([
      TASK_REAGENDAR,
      TASK_FALTOU,
      'Faltou na avaliação \u2014 reagendar',
    ]);
  });
});
