import { describe, expect, it } from 'vitest';
import { formatCents, formatDue, formatWallDateTime, initials, timeAgo } from './format';

describe('formatação do CRM', () => {
  it('valores em reais sem centavos', () => {
    expect(formatCents(1_840_000).replace(/\s/g, ' ')).toBe('R$ 18.400');
  });

  it('iniciais do nome', () => {
    expect(initials('Rita Campos')).toBe('RC');
    expect(initials('  ana  ')).toBe('A');
    expect(initials('Maria da Silva Souza')).toBe('MS');
  });

  it('vencimento da tarefa no fuso de São Paulo', () => {
    const agora = new Date('2026-10-08T15:00:00Z'); // 12:00 em SP
    expect(formatDue(new Date('2026-10-08T20:00:00Z'), agora)).toBe('hoje 17:00');
    expect(formatDue(new Date('2026-10-09T13:00:00Z'), agora)).toBe('amanhã 10:00');
    expect(formatDue(new Date('2026-10-07T13:00:00Z'), agora)).toBe('ontem 10:00');
    expect(formatDue(new Date('2026-10-20T12:30:00Z'), agora)).toBe('20/10 09:30');
  });

  it('data da agenda (hora de parede) sem converter fuso', () => {
    expect(formatWallDateTime(new Date('2026-10-12T09:00:00Z'))).toBe('12/10 09:00');
  });

  it('há quanto tempo', () => {
    const agora = new Date('2026-10-08T12:00:00Z');
    expect(timeAgo(new Date('2026-10-05T12:00:00Z'), agora)).toBe('há 3 dias');
    expect(timeAgo(new Date('2026-10-08T10:00:00Z'), agora)).toBe('há 2 h');
  });
});
