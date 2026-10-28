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
 * O funil único das clínicas que entraram no CRM antes dos dois funis
 * (`DEFAULT_PIPELINES`). Continua valendo: ele tem todos os papéis da agenda, e
 * a automação acha cada papel em qualquer funil.
 *
 * Os papéis (`role`) são o que a automação procura — a clínica pode renomear
 * qualquer etapa. "Em conversa" não tem papel: só a recepção move para lá.
 * Desmarcar ou faltar na avaliação leva para "Desmarcou"; agendar de novo tira.
 *
 * Fechou e Perdeu ficam com ordem alta só para ficarem no fim de qualquer
 * lista; no quadro elas não são colunas, e sim a barra de "solte aqui".
 */
export const DEFAULT_STAGES: readonly DefaultStage[] = [
  { name: 'Novo', color: 'gray', order: 10, role: 'NEW' },
  { name: 'Em conversa', color: 'blue', order: 20, role: null },
  { name: 'Avaliação agendada', color: 'teal', order: 30, role: 'SCHEDULED' },
  { name: 'Desmarcou', color: 'orange', order: 35, role: 'CANCELLED' },
  { name: 'Em negociação', color: 'amber', order: 40, role: 'NEGOTIATION' },
  { name: 'Fechou', color: 'green', order: 1000, role: 'WON' },
  { name: 'Perdeu', color: 'red', order: 1001, role: 'LOST' },
];

/** Nome do funil único das clínicas antigas. */
export const MAIN_PIPELINE_NAME = 'Funil principal';

export interface DefaultPipeline {
  name: string;
  order: number;
  stages: readonly DefaultStage[];
}

/**
 * Os funis com que toda clínica nova começa, como os times comerciais das
 * clínicas trabalham: a recepção conversa e agenda na Captação; agendou, o card
 * passa sozinho para Agendados, onde a avaliação, o orçamento e o fechamento
 * andam com a agenda. Spec: docs/specs/2026-10-26-planos-teste-e-funis-design.md.
 */
export const DEFAULT_PIPELINES: readonly DefaultPipeline[] = [
  {
    name: 'Captação',
    order: 10,
    stages: [
      { name: 'Novo', color: 'gray', order: 10, role: 'NEW' },
      { name: 'Em conversa', color: 'blue', order: 20, role: null },
      { name: 'Fechou', color: 'green', order: 1000, role: 'WON' },
      { name: 'Perdeu', color: 'red', order: 1001, role: 'LOST' },
    ],
  },
  {
    name: 'Agendados',
    order: 20,
    stages: [
      { name: 'Avaliação agendada', color: 'teal', order: 10, role: 'SCHEDULED' },
      { name: 'Desmarcou ou faltou', color: 'orange', order: 20, role: 'CANCELLED' },
      { name: 'Compareceu', color: 'violet', order: 30, role: 'ATTENDED' },
      { name: 'Em negociação', color: 'amber', order: 40, role: 'NEGOTIATION' },
      { name: 'Fechou', color: 'green', order: 1000, role: 'WON' },
      { name: 'Perdeu', color: 'red', order: 1001, role: 'LOST' },
    ],
  },
];

/**
 * O funil da clínica só com o CRM: sem agenda no sistema, ninguém move o card
 * sozinho para Agendados, então é um funil só, de venda, que a equipe anda à
 * mão (a avaliação é marcada na agenda que a clínica já usa). Sem papéis da
 * agenda: se um dia ela contratar a Agenda, liga os papéis em Funis e etapas.
 */
export const CRM_ONLY_PIPELINES: readonly DefaultPipeline[] = [
  {
    name: 'Vendas',
    order: 10,
    stages: [
      { name: 'Novo', color: 'gray', order: 10, role: 'NEW' },
      { name: 'Em conversa', color: 'blue', order: 20, role: null },
      { name: 'Avaliação agendada', color: 'teal', order: 30, role: null },
      { name: 'Compareceu', color: 'violet', order: 40, role: null },
      { name: 'Em negociação', color: 'amber', order: 50, role: null },
      { name: 'Fechou', color: 'green', order: 1000, role: 'WON' },
      { name: 'Perdeu', color: 'red', order: 1001, role: 'LOST' },
    ],
  },
];

/**
 * Os papéis que a agenda e os orçamentos usam. Cada um existe no máximo uma
 * vez na clínica (não por funil): é o destino do evento, em qualquer funil.
 */
export const AGENDA_ROLES = ['SCHEDULED', 'CANCELLED', 'ATTENDED', 'NEGOTIATION'] as const;
export type AgendaRole = (typeof AGENDA_ROLES)[number];

/** Como cada papel da agenda aparece na tela de configurações. */
export const AGENDA_ROLE_LABEL: Record<AgendaRole, string> = {
  SCHEDULED: 'Agendou a avaliação',
  CANCELLED: 'Desmarcou ou faltou',
  ATTENDED: 'Compareceu',
  NEGOTIATION: 'Recebeu orçamento',
};

/**
 * As etapas com que nasce um funil criado pela clínica. Só entrada, ganho e
 * perda têm papel: os papéis da agenda são um por clínica e já estão em
 * Agendados (ou no funil principal das clínicas antigas).
 */
export const NEW_PIPELINE_STAGES: readonly DefaultStage[] = [
  { name: 'Novo', color: 'gray', order: 10, role: 'NEW' },
  { name: 'Em conversa', color: 'blue', order: 20, role: null },
  { name: 'Em negociação', color: 'amber', order: 30, role: null },
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
