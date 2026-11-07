import { describe, expect, it } from 'vitest';
import { bolhas } from './mensagens';

describe('bolhas', () => {
  it('mostra só a pergunta e o texto final; esconde contexto, ferramentas e resultados', () => {
    expect(
      bolhas([
        { role: 'user', content: [{ type: 'text', text: '[contexto] Hoje é 2026-11-07' }, { type: 'text', text: 'quantos amanhã?' }] },
        { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'agenda_do_dia', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: '{}' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'São 12.' }] },
      ]),
    ).toEqual([
      { autor: 'voce', texto: 'quantos amanhã?' },
      { autor: 'assistente', texto: 'São 12.' },
    ]);
  });
});
