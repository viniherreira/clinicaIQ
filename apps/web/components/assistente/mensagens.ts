import type Anthropic from '@anthropic-ai/sdk';

type Param = Anthropic.Beta.BetaMessageParam;
export interface Bolha {
  autor: 'voce' | 'assistente';
  texto: string;
}

/** A mesma marca de assistente/prompt.ts (aquele arquivo não pode vir para o client). */
const MARCA_CONTEXTO = '[contexto]';

/** O histórico da API vira o que a pessoa vê: suas perguntas e as respostas em texto. */
export function bolhas(params: Param[]): Bolha[] {
  const out: Bolha[] = [];
  for (const p of params) {
    const blocos = typeof p.content === 'string' ? [{ type: 'text' as const, text: p.content }] : p.content;
    const texto = (blocos ?? [])
      .flatMap((b) => (b.type === 'text' && !b.text.startsWith(MARCA_CONTEXTO) ? [b.text] : []))
      .join('')
      .trim();
    if (texto) out.push({ autor: p.role === 'user' ? 'voce' : 'assistente', texto });
  }
  return out;
}
