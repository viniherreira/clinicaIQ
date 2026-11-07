import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { responder, MAX_VOLTAS, ORCAMENTO_MS, AVISO_RECUSA, AVISO_LIMITE, AVISO_CORTADA, type ClienteClaude, type Param } from './loop';
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

  it('recusa: não roda ferramenta, não guarda o turno cortado e fecha com aviso do assistente', async () => {
    const espiao = vi.fn(async () => ({}));
    const f = ferramenta({ nome: 'eco', descricao: 'd', capability: 'agenda', entrada: z.object({ n: z.number() }).strict(), executar: espiao });
    const { cliente } = falso([msg([{ type: 'tool_use', id: 't1', name: 'eco', input: { n: 1 } }] as Msg['content'], 'refusal')]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [f], ctx: {} as never, aoEscrever: () => {} });
    expect(espiao).not.toHaveBeenCalled();
    expect(r.parouPor).toBe('refusal');
    expect(r.textoFinal).toBe(AVISO_RECUSA);
    expect(r.novas.map((n) => n.param.role)).toEqual(['user', 'assistant']);
    expect(r.novas.at(-1)!.param.content).toEqual([{ type: 'text', text: AVISO_RECUSA }]);
  });

  it(`não passa de ${MAX_VOLTAS} voltas e fecha com aviso do assistente`, async () => {
    const roteiro = Array.from({ length: MAX_VOLTAS + 2 }, (_, i) =>
      msg([{ type: 'tool_use', id: `t${i}`, name: 'eco', input: { n: i } }] as Msg['content'], 'tool_use'),
    );
    const { cliente, pedidos } = falso(roteiro);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    expect(pedidos).toHaveLength(MAX_VOLTAS);
    expect(r.parouPor).toBe('limite');
    expect(r.textoFinal).toBe(AVISO_LIMITE);
    const papeis = r.novas.map((n) => n.param.role);
    expect(papeis.at(-1)).toBe('assistant');
    papeis.forEach((p, i) => expect(p).toBe(i % 2 === 0 ? 'user' : 'assistant'));
    expect(r.novas.at(-1)!.param.content).toEqual([{ type: 'text', text: AVISO_LIMITE }]);
  });

  it('max_tokens com tool_use pendurado: resultado de erro sintético, aviso e papéis alternados', async () => {
    const { cliente } = falso([
      msg([{ type: 'tool_use', id: 't1', name: 'eco', input: { n: 1 } }, { type: 'tool_use', id: 't2', name: 'eco', input: {} }] as Msg['content'], 'max_tokens'),
    ]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    expect(r.parouPor).toBe('max_tokens');
    expect(r.novas.map((n) => n.param.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(r.novas[2].param.content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: 'não executada: a resposta foi cortada', is_error: true },
      { type: 'tool_result', tool_use_id: 't2', content: 'não executada: a resposta foi cortada', is_error: true },
    ]);
    expect(r.novas[3].param.content).toEqual([{ type: 'text', text: AVISO_CORTADA }]);
  });

  it('max_tokens sem tool_use: só devolve o motivo', async () => {
    const { cliente } = falso([msg([{ type: 'text', text: 'parcial' }] as Msg['content'], 'max_tokens')]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    expect(r.parouPor).toBe('max_tokens');
    expect(r.textoFinal).toBe('parcial');
    expect(r.novas.map((n) => n.param.role)).toEqual(['user', 'assistant']);
  });

  it('duas chamadas paralelas voltam numa mensagem só, com dois resultados', async () => {
    const { cliente } = falso([
      msg([{ type: 'tool_use', id: 'a', name: 'eco', input: { n: 1 } }, { type: 'tool_use', id: 'b', name: 'eco', input: { n: 2 } }] as Msg['content'], 'tool_use'),
      msg([{ type: 'text', text: 'ok' }] as Msg['content'], 'end_turn'),
    ]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    expect(r.novas.map((n) => n.param.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    const res = r.novas[2].param.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(res.map((x) => x.tool_use_id)).toEqual(['a', 'b']);
  });

  it('ferramenta que lança vira tool_result com is_error', async () => {
    const quebra = ferramenta({ nome: 'quebra', descricao: 'd', capability: 'agenda', entrada: z.object({}).strict(), executar: async () => { throw new Error('boom'); } });
    const { cliente } = falso([
      msg([{ type: 'tool_use', id: 'q', name: 'quebra', input: {} }] as Msg['content'], 'tool_use'),
      msg([{ type: 'text', text: 'não deu' }] as Msg['content'], 'end_turn'),
    ]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [quebra], ctx: {} as never, aoEscrever: () => {} });
    const res = r.novas[2].param.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(res[0]).toMatchObject({ tool_use_id: 'q', is_error: true });
  });

  it('inputTokens soma entrada, leitura e criação de cache', async () => {
    const m = msg([{ type: 'text', text: 'ok' }] as Msg['content'], 'end_turn');
    (m.usage as unknown as Record<string, number>).cache_read_input_tokens = 100;
    (m.usage as unknown as Record<string, number>).cache_creation_input_tokens = 1000;
    const { cliente } = falso([m]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [], ctx: {} as never, aoEscrever: () => {} });
    expect(r.novas[1].inputTokens).toBe(1110);
  });

  it('separa com linha em branco o texto de voltas diferentes', async () => {
    const { cliente } = falso([
      msg([{ type: 'text', text: 'Vou ver.' }, { type: 'tool_use', id: 't1', name: 'eco', input: { n: 1 } }] as Msg['content'], 'tool_use'),
      msg([{ type: 'text', text: 'São 1.' }] as Msg['content'], 'end_turn'),
    ]);
    const escrito: string[] = [];
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: (t) => escrito.push(t) });
    expect(escrito.join('')).toBe('Vou ver.\n\nSão 1.');
    expect(r.textoFinal).toBe('São 1.');
  });
  it('estourou o orçamento de tempo: fecha como no limite de voltas, com histórico alternado', async () => {
    const { cliente, pedidos } = falso([
      msg([{ type: 'tool_use', id: 't0', name: 'eco', input: { n: 0 } }] as Msg['content'], 'tool_use'),
      msg([{ type: 'text', text: 'nunca' }] as Msg['content'], 'end_turn'),
    ]);
    let t = 1000;
    const agora = () => {
      const v = t;
      t += ORCAMENTO_MS; // cada leitura do relógio avança o orçamento inteiro
      return v;
    };
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {}, agora });
    expect(pedidos).toHaveLength(1);
    expect(r.parouPor).toBe('limite');
    expect(r.textoFinal).toBe(AVISO_LIMITE);
    const papeis = r.novas.map((n) => n.param.role);
    papeis.forEach((p, i) => expect(p).toBe(i % 2 === 0 ? 'user' : 'assistant'));
    expect(papeis.at(-1)).toBe('assistant');
    expect(r.novas.at(-1)!.param.content).toEqual([{ type: 'text', text: AVISO_LIMITE }]);
  });

  it('dentro do orçamento continua normalmente', async () => {
    const { cliente, pedidos } = falso([
      msg([{ type: 'tool_use', id: 't0', name: 'eco', input: { n: 0 } }] as Msg['content'], 'tool_use'),
      msg([{ type: 'text', text: 'ok' }] as Msg['content'], 'end_turn'),
    ]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {}, agora: () => 5 });
    expect(pedidos).toHaveLength(2);
    expect(r.textoFinal).toBe('ok');
  });

  it('fallback no meio: tool_use do modelo recusado não roda nem volta ao histórico', async () => {
    const espiao = vi.fn(async () => ({}));
    const f = ferramenta({ nome: 'eco', descricao: 'd', capability: 'agenda', entrada: z.object({ n: z.number() }).strict(), executar: espiao });
    const { cliente } = falso([
      msg(
        [
          { type: 'thinking', thinking: 'x', signature: 's' },
          { type: 'tool_use', id: 't1', name: 'eco', input: { n: 1 } },
          { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
          { type: 'text', text: 'Resposta do reserva.' },
        ] as unknown as Msg['content'],
        'end_turn',
      ),
    ]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [f], ctx: {} as never, aoEscrever: () => {} });
    expect(espiao).not.toHaveBeenCalled();
    const guardado = r.novas[1].param.content as { type: string }[];
    expect(guardado.map((b) => b.type)).toEqual(['fallback', 'text']);
    expect(r.novas[1].tools).toEqual([]);
    expect(r.textoFinal).toBe('Resposta do reserva.');
  });

  it('fallback: tool_use depois do bloco de fallback é executado normalmente', async () => {
    const { cliente } = falso([
      msg(
        [
          { type: 'tool_use', id: 'velho', name: 'eco', input: { n: 1 } },
          { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
          { type: 'tool_use', id: 'novo', name: 'eco', input: { n: 2 } },
        ] as unknown as Msg['content'],
        'tool_use',
      ),
      msg([{ type: 'text', text: 'ok' }] as Msg['content'], 'end_turn'),
    ]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    const res = r.novas[2].param.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(res.map((x) => x.tool_use_id)).toEqual(['novo']);
  });
});
