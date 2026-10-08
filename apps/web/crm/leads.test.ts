import { describe, expect, it } from 'vitest';
import { planMove, reorderColumn } from './leads';
import { DEFAULT_STAGES } from './defaults';
import type { StageLike } from './pipeline';

const stages: StageLike[] = DEFAULT_STAGES.map((s, i) => ({ id: `s${i}`, name: s.name, order: s.order, role: s.role }));
const id = (role: string | null, name?: string) =>
  stages.find((s) => (name ? s.name === name : s.role === role))!.id;
const agora = new Date('2026-10-08T12:00:00Z');
const aberto = { stageId: id('NEW'), wonAt: null, lostAt: null };

describe('planMove', () => {
  it('perder exige motivo', () => {
    expect(planMove(aberto, stages, id('LOST'), null, agora)).toEqual({ ok: false, message: 'Escolha o motivo da perda.' });
    const r = planMove(aberto, stages, id('LOST'), 'motivo1', agora);
    expect(r).toMatchObject({ ok: true, event: 'lost', data: { lostAt: agora, lostReasonId: 'motivo1', wonAt: null } });
  });

  it('ganhar marca a data, e ganhar de novo não muda a data', () => {
    expect(planMove(aberto, stages, id('WON'), null, agora)).toMatchObject({ ok: true, event: 'won', data: { wonAt: agora } });
    const antes = new Date('2026-01-01');
    const jaGanho = { stageId: id('WON'), wonAt: antes, lostAt: null };
    expect(planMove(jaGanho, stages, id('WON'), null, agora)).toMatchObject({ event: 'none', data: { wonAt: antes } });
  });

  it('sair de ganho ou perdido para uma coluna reabre e limpa as datas', () => {
    const perdido = { stageId: id('LOST'), wonAt: null, lostAt: agora };
    expect(planMove(perdido, stages, id(null, 'Em conversa'), null, agora)).toMatchObject({
      ok: true,
      event: 'reopened',
      data: { wonAt: null, lostAt: null, lostReasonId: null },
    });
  });

  it('de ganho direto para perdido troca uma marca pela outra', () => {
    const ganho = { stageId: id('WON'), wonAt: agora, lostAt: null };
    expect(planMove(ganho, stages, id('LOST'), 'm', agora)).toMatchObject({ data: { wonAt: null, lostAt: agora } });
  });

  it('mover entre colunas é só mover', () => {
    expect(planMove(aberto, stages, id('SCHEDULED'), null, agora)).toMatchObject({ ok: true, event: 'moved' });
    expect(planMove(aberto, stages, id('NEW'), null, agora)).toMatchObject({ ok: true, event: 'none' });
  });

  it('etapa de outra clínica (ou inexistente) é recusada', () => {
    expect(planMove(aberto, stages, 'de-outra-clinica', null, agora).ok).toBe(false);
  });
});

describe('reorderColumn', () => {
  it('coloca o lead na posição pedida', () => {
    expect(reorderColumn(['a', 'b', 'c'], 'x', 0)).toEqual(['x', 'a', 'b', 'c']);
    expect(reorderColumn(['a', 'b', 'c'], 'x', 2)).toEqual(['a', 'b', 'x', 'c']);
  });

  it('move dentro da mesma coluna sem duplicar', () => {
    expect(reorderColumn(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
  });

  it('posição fora do limite vai para a ponta', () => {
    expect(reorderColumn(['a'], 'x', 99)).toEqual(['a', 'x']);
    expect(reorderColumn(['a'], 'x', -5)).toEqual(['x', 'a']);
  });
});
