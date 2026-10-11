import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalPhone, isValidPhone, maskPhone, phoneHash } from './phone';
import { taskStatus } from './tasks-status';

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';
});

describe('telefone do lead', () => {
  it('o mesmo número digitado de jeitos diferentes é o mesmo lead', () => {
    const formas = ['(11) 98765-4321', '11987654321', '+55 11 98765-4321', '011 98765 4321'];
    expect(new Set(formas.map(canonicalPhone)).size).toBe(1);
    expect(new Set(formas.map((f) => phoneHash(f, 't1'))).size).toBe(1);
  });

  it('valida DDD + número', () => {
    expect(isValidPhone('(11) 98765-4321')).toBe(true);
    expect(isValidPhone('(11) 3456-7890')).toBe(true);
    expect(isValidPhone('98765-4321')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });

  it('a máscara mostra só o DDD e o fim', () => {
    expect(maskPhone('(11) 98765-4321')).toBe('(11) •••••-4321');
    expect(maskPhone('5511987654321')).toBe('(11) •••••-4321');
    expect(maskPhone('')).toBe('');
  });
});

describe('taskStatus', () => {
  const agora = new Date('2026-10-08T12:00:00Z');
  const em = (horas: number) => new Date(agora.getTime() + horas * 3_600_000);

  it('sem tarefa pendente = "sem tarefa", mesmo com tarefas concluídas', () => {
    expect(taskStatus([], agora)).toEqual({ kind: 'none' });
    expect(taskStatus([{ dueAt: em(-5), completedAt: em(-4) }], agora)).toEqual({ kind: 'none' });
  });

  it('qualquer pendente vencida torna o lead atrasado', () => {
    const r = taskStatus([{ dueAt: em(2), completedAt: null }, { dueAt: em(-30), completedAt: null }], agora);
    expect(r).toEqual({ kind: 'overdue', dueAt: em(-30), count: 1 });
  });

  it('em dia mostra a próxima a vencer', () => {
    const r = taskStatus([{ dueAt: em(48), completedAt: null }, { dueAt: em(3), completedAt: null }], agora);
    expect(r).toEqual({ kind: 'upcoming', dueAt: em(3) });
  });
});
