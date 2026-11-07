import type Anthropic from '@anthropic-ai/sdk';
import { MODELO } from './cliente';
import { PROMPT_SISTEMA } from './prompt';
import { executarFerramenta, paraApi } from './registro';
import type { Contexto, Ferramenta } from './ferramentas/tipos';

export type Param = Anthropic.Beta.BetaMessageParam;

/** O que o loop usa do SDK. Injetável para o teste usar um Claude falso. */
export interface StreamLike {
  on(evento: 'text', cb: (t: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Beta.BetaMessage>;
}
export interface ClienteClaude {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beta: { messages: { stream(params: any): StreamLike } };
}

export interface NovaMensagem {
  param: Param;
  tools: string[];
  inputTokens: number;
  outputTokens: number;
}

/** Teto de idas e voltas com ferramentas numa pergunta. */
export const MAX_VOLTAS = 8;

/** Textos fixos: a rota mostra ao usuário a mesma string que o histórico guarda. */
export const AVISO_RECUSA = 'Não consegui responder a essa pergunta. Tente reformular.';
export const AVISO_LIMITE = 'A pergunta exigiu consultas demais. Tente dividir em partes.';
export const AVISO_CORTADA = 'A resposta ficou longa demais e foi cortada. Tente uma pergunta mais específica.';

const aviso = (text: string): NovaMensagem => ({
  param: { role: 'assistant', content: [{ type: 'text', text }] },
  tools: [],
  inputTokens: 0,
  outputTokens: 0,
});

/**
 * Uma pergunta: manda o histórico mais a pergunta, roda as ferramentas pedidas
 * e repete até a resposta final. Só acrescenta ao histórico, nunca edita o que
 * já foi, porque o cache e o pensamento do modelo dependem disso.
 */
export async function responder({
  cliente,
  historico,
  pergunta,
  ferramentas,
  ctx,
  aoEscrever,
}: {
  cliente: ClienteClaude;
  historico: Param[];
  pergunta: Param;
  ferramentas: Ferramenta[];
  ctx: Contexto;
  aoEscrever: (texto: string) => void;
}): Promise<{ novas: NovaMensagem[]; textoFinal: string; parouPor: string }> {
  const tools = paraApi(ferramentas);
  const messages: Param[] = [...historico, pergunta];
  const novas: NovaMensagem[] = [{ param: pergunta, tools: [], inputTokens: 0, outputTokens: 0 }];
  let textoFinal = '';
  let jaEscreveu = false;

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const stream = cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: PROMPT_SISTEMA, cache_control: { type: 'ephemeral' } }],
      ...(tools.length ? { tools } : {}),
      messages,
    });
    let primeiro = true;
    stream.on('text', (t) => {
      if (primeiro && jaEscreveu) aoEscrever('\n\n');
      primeiro = false;
      jaEscreveu = true;
      aoEscrever(t);
    });
    const resposta = await stream.finalMessage();

    // Uma recusa pode cortar um tool_use no meio: nunca rode as ferramentas dessa volta.
    // O turno recusado não é guardado; o histórico fecha com o aviso.
    if (resposta.stop_reason === 'refusal') {
      novas.push(aviso(AVISO_RECUSA));
      return { novas, textoFinal: AVISO_RECUSA, parouPor: 'refusal' };
    }

    const assistente: Param = { role: 'assistant', content: resposta.content };
    const chamadas = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    messages.push(assistente);
    novas.push({
      param: assistente,
      tools: chamadas.map((c) => c.name),
      inputTokens:
        resposta.usage.input_tokens +
        (resposta.usage.cache_read_input_tokens ?? 0) +
        (resposta.usage.cache_creation_input_tokens ?? 0),
      outputTokens: resposta.usage.output_tokens,
    });
    textoFinal = resposta.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');

    if (resposta.stop_reason !== 'tool_use' && chamadas.length > 0) {
      // Chamada cortada: não roda, mas cada tool_use precisa de um resultado para o histórico ser válido.
      novas.push({
        param: {
          role: 'user',
          content: chamadas.map((c): Anthropic.Beta.BetaToolResultBlockParam => ({
            type: 'tool_result',
            tool_use_id: c.id,
            content: 'não executada: a resposta foi cortada',
            is_error: true,
          })),
        },
        tools: [],
        inputTokens: 0,
        outputTokens: 0,
      });
      novas.push(aviso(AVISO_CORTADA));
      return { novas, textoFinal, parouPor: resposta.stop_reason ?? 'fim' };
    }

    if (resposta.stop_reason !== 'tool_use' || chamadas.length === 0) {
      return { novas, textoFinal, parouPor: resposta.stop_reason ?? 'fim' };
    }

    // Todas as respostas das ferramentas numa mensagem só (é o que mantém as chamadas em paralelo).
    const resultados = await Promise.all(
      chamadas.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const r = await executarFerramenta(ferramentas, c.name, c.input, ctx);
        return { type: 'tool_result', tool_use_id: c.id, content: r.conteudo, ...(r.erro ? { is_error: true } : {}) };
      }),
    );
    const usuario: Param = { role: 'user', content: resultados };
    messages.push(usuario);
    novas.push({ param: usuario, tools: [], inputTokens: 0, outputTokens: 0 });
  }
  novas.push(aviso(AVISO_LIMITE));
  return { novas, textoFinal: AVISO_LIMITE, parouPor: 'limite' };
}
