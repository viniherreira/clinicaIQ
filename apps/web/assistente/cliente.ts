import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/** O modelo do assistente. Trocar é decisão do dono (spec, seção 4). */
export const MODELO = 'claude-opus-5-5';

let instancia: Anthropic | null = null;

/** Um cliente por processo. Lê ANTHROPIC_API_KEY do ambiente. */
export function claude(): Anthropic {
  instancia ??= new Anthropic();
  return instancia;
}
