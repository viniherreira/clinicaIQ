/**
 * O motor do robô por botões — regras puras, sem banco, testadas por tabela.
 *
 * Um robô é um menu (com submenus opcionais). Cada opção responde um texto,
 * pode abrir outro menu e pode agir no CRM (criar o lead, pôr tag, mudar de
 * etapa, trocar o responsável, passar para a equipe).
 */

export type BotAction =
  | { type: 'createLead'; stageId?: string }
  | { type: 'tag'; tagId: string }
  | { type: 'stage'; stageId: string }
  | { type: 'assign'; userId: string }
  | { type: 'handoff' };

export interface BotOption {
  id: string;
  label: string;
  reply?: string;
  /** Menu seguinte. Sem ele, o robô termina depois desta opção. */
  next?: string;
  actions?: BotAction[];
}

export interface BotStep {
  id: string;
  text: string;
  options: BotOption[];
}

export interface BotSteps {
  start: string;
  steps: Record<string, BotStep>;
}

export const MAX_OPTIONS = 10;
export const BOT_IDLE_MS = 24 * 60 * 60 * 1000;
export const MISS_TEXT = 'Não entendi. Responda com o número de uma das opções:';
export const HANDOFF_TEXT = 'Já vou chamar alguém da equipe para te ajudar. 😊';

/** Sem acento, minúsculo, sem pontuação nas pontas — para comparar o que a pessoa digitou. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lê o que veio do banco/tela; o que não fizer sentido vira null. */
export function parseSteps(raw: unknown): BotSteps | null {
  const r = raw as BotSteps | null;
  if (!r || typeof r.start !== 'string' || typeof r.steps !== 'object' || !r.steps[r.start]) return null;
  return r;
}

/** O texto do menu com as opções numeradas (funciona até onde os botões não aparecem) e os botões. */
export function renderStep(step: BotStep): { text: string; buttons: { id: string; title: string }[] } {
  const lista = step.options.map((o, i) => `${i + 1} - ${o.label}`).join('\n');
  return {
    text: lista ? `${step.text.trim()}\n\n${lista}` : step.text.trim(),
    buttons: step.options.map((o) => ({ id: `bot:${step.id}:${o.id}`, title: o.label })),
  };
}

/** Qual opção a pessoa escolheu: botão tocado, número ("2", "2.", "opção 2") ou o próprio texto da opção. */
export function matchOption(step: BotStep, input: { text: string; buttonId?: string | null }): BotOption | null {
  if (input.buttonId) {
    const byId = step.options.find((o) => input.buttonId === `bot:${step.id}:${o.id}`);
    if (byId) return byId;
  }
  const t = normalize(input.text);
  if (!t) return null;
  const num = /^(?:opcao |op )?(\d{1,2})$/.exec(t);
  if (num) return step.options[Number(num[1]) - 1] ?? null;
  return step.options.find((o) => normalize(o.label) === t) ?? null;
}

export interface BotState {
  stepId: string | null;
  misses: number;
  /** Última atividade do robô. */
  startedAt: Date | null;
}

export interface BotOutMessage {
  text: string;
  buttons?: { id: string; title: string }[];
}

export type BotDecision = {
  messages: BotOutMessage[];
  actions: BotAction[];
  /** Estado depois: null = robô parou. */
  next: { stepId: string; misses: number } | null;
};

/** Começar o robô: manda o primeiro menu. */
export function startBot(flow: BotSteps): BotDecision {
  const step = flow.steps[flow.start];
  const r = renderStep(step);
  return { messages: [{ text: r.text, buttons: r.buttons }], actions: [], next: { stepId: step.id, misses: 0 } };
}

/** O robô está num menu e a pessoa respondeu. */
export function continueBot(flow: BotSteps, state: { stepId: string; misses: number }, input: { text: string; buttonId?: string | null }): BotDecision {
  const step = flow.steps[state.stepId];
  if (!step) return { messages: [], actions: [], next: null };

  const opt = matchOption(step, input);
  if (!opt) {
    // Primeira vez: repete o menu. Segunda: chama alguém.
    if (state.misses >= 1) return { messages: [{ text: HANDOFF_TEXT }], actions: [{ type: 'handoff' }], next: null };
    const r = renderStep(step);
    return {
      messages: [{ text: `${MISS_TEXT}\n\n${r.text.split('\n\n').slice(1).join('\n\n')}`, buttons: r.buttons }],
      actions: [],
      next: { stepId: step.id, misses: state.misses + 1 },
    };
  }

  const messages: BotOutMessage[] = [];
  if (opt.reply?.trim()) messages.push({ text: opt.reply.trim() });
  const actions = opt.actions ?? [];
  const handoff = actions.some((a) => a.type === 'handoff');
  const nextStep = !handoff && opt.next ? flow.steps[opt.next] : undefined;
  if (nextStep) {
    const r = renderStep(nextStep);
    messages.push({ text: r.text, buttons: r.buttons });
    return { messages, actions, next: { stepId: nextStep.id, misses: 0 } };
  }
  if (handoff && !opt.reply?.trim()) messages.push({ text: HANDOFF_TEXT });
  return { messages, actions, next: null };
}

/** A mensagem é uma das palavras-chave do robô? */
export function isKeyword(text: string, keywords: string[]): boolean {
  const t = normalize(text);
  return Boolean(t) && keywords.some((k) => normalize(k) === t);
}

/** O robô ficou parado tempo demais e não vale mais. */
export const botExpired = (startedAt: Date | null, now: Date) => !startedAt || now.getTime() - startedAt.getTime() > BOT_IDLE_MS;

/** Problemas num robô antes de salvar (ou null). */
export function stepsProblem(flow: BotSteps): string | null {
  const start = flow.steps[flow.start];
  if (!start) return 'O robô precisa de um menu inicial.';
  for (const s of Object.values(flow.steps)) {
    if (!s.text.trim()) return 'Escreva a mensagem de cada menu.';
    if (s.options.length === 0) return 'Cada menu precisa de pelo menos uma opção.';
    if (s.options.length > MAX_OPTIONS) return `No máximo ${MAX_OPTIONS} opções por menu.`;
    for (const o of s.options) {
      if (!o.label.trim()) return 'Toda opção precisa de um nome.';
      if (o.label.trim().length > 24) return 'O nome da opção tem no máximo 24 caracteres (limite do WhatsApp).';
      if (o.next && !flow.steps[o.next]) return 'Uma opção aponta para um menu que não existe.';
    }
  }
  return null;
}
