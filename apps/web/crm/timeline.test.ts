import { describe, expect, it } from 'vitest';
import { toTimeline, type ActivityLike, type TimelineNames } from './timeline';

const names: TimelineNames = {
  stages: new Map([
    ['s1', 'Novo'],
    ['s2', 'Em conversa'],
    ['s9', 'Fechou'],
  ]),
  tags: new Map([['t1', 'implante']]),
  people: new Map([['u1', 'Rita Campos']]),
  reasons: new Map([['r1', 'Achou caro']]),
  wonStageId: 's9',
};
const at = new Date('2026-10-08T12:00:00Z');
const a = (type: string, data: unknown, actorId: string | null = 'u1'): ActivityLike => ({ id: type, type, data, actorId, createdAt: at });

describe('toTimeline', () => {
  it('quem fez: a pessoa, ou "Automação" quando foi a integração', () => {
    const [humano, robo] = toTimeline([a('NOTE', { text: 'oi' }), a('CLINIC_EVENT', { event: 'appointment.created' }, null)], names);
    expect(humano.who).toBe('Rita Campos');
    expect(robo.who).toBe('Automação');
  });

  it('frases para cada tipo', () => {
    const t = toTimeline(
      [
        a('CREATED', { source: 'INSTAGRAM' }),
        a('STAGE_CHANGED', { from: 's1', to: 's2' }),
        a('LOST', { lostReasonId: 'r1' }),
        a('TAG_ADDED', { tagId: 't1' }),
        a('TASK_CREATED', { text: 'Ligar', taskId: 'k1' }),
        a('TASK_COMPLETED', { text: 'Ligar', taskId: 'k1' }),
        a('CLINIC_EVENT', { event: 'quote.rejected', reason: 'caro demais' }, null),
      ],
      names,
    ).map((e) => e.text);
    expect(t).toEqual([
      'Lead criado (Instagram)',
      'Moveu de Novo para Em conversa',
      'Marcado como perdido: Achou caro',
      'Tag adicionada: implante',
      'Tarefa: Ligar',
      'Tarefa concluída: Ligar',
      'Orçamento recusado pelo paciente: “caro demais”',
    ]);
  });

  it('fechamento pela automação diz de onde veio', () => {
    const [e] = toTimeline([a('STAGE_CHANGED', { from: 's2', to: 's9', event: 'quote.accepted' }, null)], names);
    expect(e).toMatchObject({ kind: 'won', text: 'Negócio fechado — orçamento aprovado' });
  });

  it('etapa apagada não quebra a frase', () => {
    const [e] = toTimeline([a('STAGE_CHANGED', { from: 'x', to: 's2' })], names);
    expect(e.text).toBe('Moveu de uma etapa removida para Em conversa');
  });
});
