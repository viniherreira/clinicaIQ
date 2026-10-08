import type { StageRole } from '@clinicaiq/db';

/**
 * Cores das etapas e tags. São nomes, não hex: a tela traduz cada nome para
 * classes com contraste testado nos dois temas (ver `crm/colors.ts`), e a
 * clínica escolhe numa lista em vez de digitar uma cor que some no fundo.
 */
export const CRM_COLORS = ['gray', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'violet'] as const;
export type CrmColor = (typeof CRM_COLORS)[number];

export interface DefaultStage {
  name: string;
  color: CrmColor;
  order: number;
  role: StageRole | null;
}

/**
 * O funil com que toda clínica começa. O caminho de uma clínica: o contato
 * chega, conversa, agenda a avaliação, recebe o orçamento e fecha.
 *
 * Os papéis (`role`) são o que a automação procura — a clínica pode renomear
 * qualquer etapa. "Em conversa" não tem papel: só a recepção move para lá,
 * ou o cancelamento de uma avaliação devolve para lá.
 *
 * Fechou e Perdeu ficam com ordem alta só para ficarem no fim de qualquer
 * lista; no quadro elas não são colunas, e sim a barra de "solte aqui".
 */
export const DEFAULT_STAGES: readonly DefaultStage[] = [
  { name: 'Novo', color: 'gray', order: 10, role: 'NEW' },
  { name: 'Em conversa', color: 'blue', order: 20, role: null },
  { name: 'Avaliação agendada', color: 'teal', order: 30, role: 'SCHEDULED' },
  { name: 'Em negociação', color: 'amber', order: 40, role: 'NEGOTIATION' },
  { name: 'Fechou', color: 'green', order: 1000, role: 'WON' },
  { name: 'Perdeu', color: 'red', order: 1001, role: 'LOST' },
];

export const DEFAULT_LOST_REASONS: readonly string[] = [
  'Achou caro',
  'Sem resposta',
  'Fechou com outra clínica',
  'Só pesquisando',
  'Outro',
];
