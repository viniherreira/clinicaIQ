import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { groupTasks } = await import('./task-list');

const row = (id: string, dueAt: string) => ({ id, text: id, dueAt, leadId: 'l', leadLabel: 'L', assignee: 'R', automatic: false });

describe('groupTasks', () => {
  it('separa pelo dia de São Paulo, não do UTC', () => {
    const agora = new Date('2026-10-08T15:00:00Z'); // 12:00 em SP
    const g = groupTasks(
      [
        row('venceu', '2026-10-08T14:00:00Z'), // 11:00 de hoje, já passou
        row('hoje', '2026-10-09T01:00:00Z'), // 22:00 de hoje em SP, mesmo sendo dia 9 em UTC
        row('amanha', '2026-10-09T13:00:00Z'),
        row('semana', '2026-10-13T13:00:00Z'),
        row('depois', '2026-10-20T13:00:00Z'),
      ],
      agora,
    );
    expect(g.atrasadas.map((t) => t.id)).toEqual(['venceu']);
    expect(g.hoje.map((t) => t.id)).toEqual(['hoje']);
    expect(g.amanha.map((t) => t.id)).toEqual(['amanha']);
    expect(g.semana.map((t) => t.id)).toEqual(['semana']);
    expect(g.depois.map((t) => t.id)).toEqual(['depois']);
  });
});
