import type Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { can, type Role } from '@/lib/permissions';
import { reportError } from '@/lib/observability';
import type { Contexto, Ferramenta } from './ferramentas/tipos';
import { listarProfissionais } from './ferramentas/profissionais';
import { buscarPacientes } from './ferramentas/pacientes';
import { ultimosAtendidos } from './ferramentas/atendidos';
import { agendaDoDia } from './ferramentas/agenda-do-dia';
import { horariosLivres } from './ferramentas/horarios-livres';
import { cancelamentos } from './ferramentas/cancelamentos';
import { semRetorno } from './ferramentas/sem-retorno';
import { saldoDevedor } from './ferramentas/saldo';
import { faturamento } from './ferramentas/faturamento';

/** Ordem fixa: a lista de ferramentas faz parte do prefixo em cache. */
export const TODAS: Ferramenta[] = [
  listarProfissionais,
  buscarPacientes,
  ultimosAtendidos,
  agendaDoDia,
  horariosLivres,
  cancelamentos,
  semRetorno,
  saldoDevedor,
  faturamento,
];

/** Ferramenta que o papel não alcança nem chega ao modelo. */
export function ferramentasPara(role: Role): Ferramenta[] {
  return TODAS.filter((f) => can(role, f.capability));
}

export function paraApi(fs: Ferramenta[]): Anthropic.Beta.BetaTool[] {
  return fs.map((f) => {
    const { $schema: _ignorado, ...schema } = zodToJsonSchema(f.entrada, { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>;
    return {
      name: f.nome,
      description: f.descricao,
      input_schema: { ...schema, type: 'object' } as Anthropic.Beta.BetaTool.InputSchema,
    };
  });
}

/** Roda a ferramenta pedida. Erro vira texto para o modelo, nunca exceção para a rota. */
export async function executarFerramenta(
  fs: Ferramenta[],
  nome: string,
  input: unknown,
  ctx: Contexto,
): Promise<{ conteudo: string; erro: boolean }> {
  const f = fs.find((x) => x.nome === nome);
  if (!f) return { conteudo: 'ferramenta não disponível para este usuário', erro: true };
  const parsed = f.entrada.safeParse(input);
  if (!parsed.success) return { conteudo: `entrada inválida: ${parsed.error.issues.map((i) => i.message).join('; ')}`, erro: true };
  try {
    return { conteudo: JSON.stringify(await f.executar(ctx, parsed.data)), erro: false };
  } catch (e) {
    reportError(e, { area: 'assistente', ferramenta: nome });
    return { conteudo: 'a consulta falhou; diga ao usuário que não foi possível obter esse dado agora', erro: true };
  }
}
