import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { responder, MAX_VOLTAS, type ClienteClaude, type Param } from './loop';
import { ferramenta } from './ferramentas/tipos';

type Msg = Anthropic.Beta.BetaMessage;
const msg = (content: Msg['content'], stop: Msg['stop_reason']): Msg =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason: stop, stop_sequence: null,
     usage: { input_tokens: 10, output_tokens: 5 } }) as unknown as Msg;

function falso(roteiro: Msg[]) {
  const pedidos: Record<string, unknown>[] = [];
  const cliente: ClienteClaude = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          pedidos.push(structuredClone(params));
          const resposta = roteiro.shift()!;
          return {
            on(_e: 'text', cb: (t: string) => void) {
              for (const b of resposta.content) if (b.type === 'text') cb(b.text);
              return this;
            },
            finalMessage: async () => resposta,
          };
        },
      },
    },
  };
  return { cliente, pedidos };
}

const eco = ferramenta({
  nome: 'eco',
  descricao: 'devolve o número',
  capability: 'agenda',
  entrada: z.object({ n: z.number() }).strict(),
  executar: async (_ctx, { n }) => ({ n }),
});
const pergunta: Param = { role: 'user', content: [{ type: 'text', text: 'quanto?' }] };

describe('responder', () => {
  it('chama a ferramenta, devolve o resultado ao modelo e escreve a resposta', async () => {
    const { cliente, pedidos } = falso([
      msg([{ type: 'tool_use', id: 't1', name: 'eco', input: { n: 7 } }] as Msg['content'], 'tool_use'),
      msg([{ type: 'text', text: 'São 7.' }] as Msg['content'], 'end_turn'),
    ]);
    const escrito: string[] = [];
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: (t) => escrito.push(t) });

    expect(r.textoFinal).toBe('São 7.');
    expect(escrito.join('')).toBe('São 7.');
    // pergunta, chamada da ferramenta, resultado, resposta
    expect(r.novas.map((n) => n.param.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(r.novas[1].tools).toEqual(['eco']);
    const resultado = (r.novas[2].param.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(resultado).toMatchObject({ type: 'tool_result', tool_use_id: 't1', content: '{"n":7}' });
    // A segunda chamada leva o histórico inteiro.
    expect((pedidos[1].messages as unknown[]).length).toBe(3);
    expect(pedidos[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'medium' } });
  });

  it('o histórico anterior vai antes da pergunta (contexto da conversa)', async () => {
    const { cliente, pedidos } = falso([msg([{ type: 'text', text: 'ok' }] as Msg['content'], 'end_turn')]);
    const antes: Param[] = [
      { role: 'user', content: [{ type: 'text', text: 'últimos 5' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Ana, Bia…' }] },
    ];
    await responder({ cliente, historico: antes, pergunta, ferramentas: [], ctx: {} as never, aoEscrever: () => {} });
    expect(pedidos[0].messages).toEqual([...antes, pergunta]);
  });

  it('para em recusa sem rodar ferramenta', async () => {
    const { cliente } = falso([msg([{ type: 'tool_use', id: 't1', name: 'eco', input: { n: 1 } }] as Msg['content'], 'refusal')]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    expect(r.parouPor).toBe('refusal');
    expect(r.novas.map((n) => n.param.role)).toEqual(['user']);
  });

  it(`não passa de ${MAX_VOLTAS} voltas`, async () => {
    const roteiro = Array.from({ length: MAX_VOLTAS + 2 }, (_, i) =>
      msg([{ type: 'tool_use', id: `t${i}`, name: 'eco', input: { n: i } }] as Msg['content'], 'tool_use'),
    );
    const { cliente, pedidos } = falso(roteiro);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    expect(pedidos).toHaveLength(MAX_VOLTAS);
    expect(r.parouPor).toBe('limite');
  });
});
