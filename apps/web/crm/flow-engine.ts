import { DEFAULT_HOURS, fillVars, hasWord, normalize, type BotAudience, type BotHours, type BotSaveField } from './bot-engine';

/**
 * O robô em passos ligados por setas, no jeito do Salesbot do Kommo — regras
 * puras, sem banco, testadas por tabela em `flow-engine.test.ts`.
 *
 * Um fluxo é um conjunto de passos numerados. Cada passo tem saídas (`out`),
 * e cada saída aponta para outro passo. O motor anda pelos passos até
 * precisar esperar (uma mensagem que espera resposta, uma pausa) ou parar, e
 * devolve as mensagens a mandar, as ações a fazer no CRM e onde ficou
 * esperando. `crm/bot.ts` executa; o simulador da tela roda este mesmo motor.
 *
 * Spec: docs/specs/2026-10-20-crm-robo-salesbot-design.md
 */

// ─── Passos ───────────────────────────────────────────────────────────────────

/** Saídas de um passo: nome da saída → id do passo seguinte. */
export type FlowOut = Record<string, string | undefined>;

export interface FlowButton {
  id: string;
  label: string;
  /** Outras palavras que valem como este botão ("sim", "quero"). */
  synonyms: string[];
}

export interface MessageStep {
  id: string;
  type: 'message';
  text: string;
  buttons: FlowButton[];
  /** Espera a resposta da pessoa (com botões, espera sempre). */
  waitReply: boolean;
  /** Sem resposta em tantos minutos, segue pela saída `timeout`. Null = espera até o robô expirar (24 h). */
  timeoutMinutes: number | null;
  out: FlowOut;
}

export type RuleSubject = 'message' | 'tag' | 'stage' | 'source' | 'field' | 'hours';

export interface FlowRule {
  subject: RuleSubject;
  /**
   * message: contains | equals | starts | empty | notEmpty
   * tag: has | hasNot · stage: is | isNot · source: is | isNot
   * field: equals | filled | empty · hours: inside | outside
   */
  op: string;
  /** Palavras (separadas por vírgula), valor do campo ou origem. */
  value?: string;
  /** Id da tag, etapa ou campo. */
  ref?: string;
}

export interface ConditionCase {
  id: string;
  label?: string;
  match: 'all' | 'any';
  rules: FlowRule[];
}

export interface ConditionStep {
  id: string;
  type: 'condition';
  cases: ConditionCase[];
  out: FlowOut;
}

export interface PauseStep {
  id: string;
  type: 'pause';
  /** Segue pela saída `message` quando a pessoa escrever. */
  waitMessage: boolean;
  /** Segue pela saída `timer` depois de tantos minutos. */
  minutes: number | null;
  out: FlowOut;
}

export type ValidateCheck = 'email' | 'phone' | 'number' | 'cpf' | 'contains' | 'equals' | 'minLength';

export interface ValidateStep {
  id: string;
  type: 'validate';
  check: ValidateCheck;
  value?: string;
  out: FlowOut;
}

export type FlowAction =
  | { type: 'createLead'; stageId?: string }
  | { type: 'stage'; stageId: string }
  | { type: 'tag'; tagId: string }
  | { type: 'untag'; tagId: string }
  | { type: 'setField'; field: BotSaveField; from: 'lastMessage' | 'value'; value?: string; /** A pergunta, para a anotação no histórico. */ question?: string }
  | { type: 'assign'; userId: string }
  | { type: 'task'; text: string; dueMinutes: number }
  | { type: 'note'; text: string }
  | { type: 'notify'; text: string };

export interface ActionStep {
  id: string;
  type: 'action';
  actions: FlowAction[];
  out: FlowOut;
}

export interface GotoStep {
  id: string;
  type: 'goto';
  target: string;
  /**
   * send: manda a mensagem do passo de novo · silent: volta a esperar nele sem
   * mandar nada · retry: "Não entendi" com os botões, uma vez; na segunda, chama a equipe.
   */
  mode: 'send' | 'silent' | 'retry';
  out: FlowOut;
}

export interface StartBotStep {
  id: string;
  type: 'startBot';
  botId: string;
  out: FlowOut;
}

export interface RoundRobinStep {
  id: string;
  type: 'roundRobin';
  options: { id: string; label: string }[];
  out: FlowOut;
}

export interface HandoffStep {
  id: string;
  type: 'handoff';
  text: string;
  out: FlowOut;
}

export interface StopStep {
  id: string;
  type: 'stop';
  out: FlowOut;
}

export type FlowStep =
  | MessageStep
  | ConditionStep
  | PauseStep
  | ValidateStep
  | ActionStep
  | GotoStep
  | StartBotStep
  | RoundRobinStep
  | HandoffStep
  | StopStep;

export type FlowStepType = FlowStep['type'];

/** O robô guardado em `ChatbotFlow.steps` (formato 2). */
export interface FlowDoc {
  version: 2;
  start: string;
  steps: Record<string, FlowStep>;
  /** Posição de cada caixa no quadro. */
  layout?: Record<string, { x: number; y: number }>;
  hours?: BotHours;
  audience?: BotAudience;
  /** Configuração dos gatilhos novos (etapa, tag, sem resposta). */
  trigger?: FlowTriggerConfig;
}

export interface FlowTriggerConfig {
  /** STAGE: começa quando o lead é criado ou movido para uma destas etapas. */
  stageIds?: string[];
  /** TAG: começa quando uma destas tags é posta no lead. */
  tagIds?: string[];
  /** NO_REPLY: começa quando a clínica falou por último e a pessoa não responde há tantas horas. */
  hours?: number;
}

// ─── Execução ─────────────────────────────────────────────────────────────────

export const MAX_STEPS_PER_RUN = 50;
export const FLOW_MISS_TEXT = 'Não entendi. Toque em uma das opções abaixo.';
export const FLOW_HANDOFF_TEXT = 'Já vou chamar alguém da equipe para te ajudar. 😊';

/** O que o motor sabe da conversa para decidir (as ações mudam isso na hora). */
export interface FlowContext {
  now: Date;
  tagIds: string[];
  stageId: string | null;
  source: string | null;
  /** Campos personalizados do lead: id → texto. */
  fields: Record<string, string>;
  /** A clínica está atendendo agora? (para a condição de horário) */
  open: boolean;
  /** Nome da pessoa e da clínica, para as variáveis. */
  vars: { name?: string | null; clinic?: string | null; phone?: string | null; fieldsByName?: Record<string, string> };
  /** Rodízio: qual opção desta vez (o executor guarda o contador). */
  roundRobin: (stepId: string, size: number) => number;
}

/** `start` leva a mensagem que fez o robô começar (a condição do primeiro passo pode olhar para ela). */
export type FlowEvent = { kind: 'start'; text?: string } | { kind: 'message'; text: string; buttonId?: string | null } | { kind: 'timer' };

export interface FlowState {
  stepId: string;
  misses: number;
  /** Quando acordar sozinho (sem resposta / pausa). */
  wakeAt: Date | null;
}

export interface FlowOutMessage {
  stepId: string;
  text: string;
  buttons?: { id: string; title: string }[];
}

/** O que sai do motor para o CRM: as ações dos passos e as do próprio robô. */
export type FlowEffect =
  | (FlowAction & { stepId: string })
  | { type: 'handoff'; stepId: string }
  | { type: 'startBot'; botId: string; stepId: string };

export interface FlowResult {
  messages: FlowOutMessage[];
  effects: FlowEffect[];
  /** Null: o robô terminou. */
  state: FlowState | null;
  /** Passos por onde passou, em ordem (o simulador destaca). */
  visited: string[];
}

/** Variáveis do Kommo (`{{nome}}`) e as antigas (`{nome}`). */
export function renderText(text: string, ctx: Pick<FlowContext, 'vars'>, lastMessage: string): string {
  const campos = ctx.vars.fieldsByName ?? {};
  const t = text
    .replace(/\{\{\s*ultima_mensagem\s*\}\}/gi, lastMessage)
    .replace(/\{\{\s*telefone\s*\}\}/gi, ctx.vars.phone ?? '')
    .replace(/\{\{\s*campo:([^}]+)\}\}/gi, (_, nome: string) => {
      const chave = Object.keys(campos).find((k) => normalize(k) === normalize(nome));
      return chave ? campos[chave] : '';
    })
    .replace(/\{\{\s*(primeiro_nome|nome|clinica)\s*\}\}/gi, '{$1}');
  return fillVars(t, { name: ctx.vars.name, clinic: ctx.vars.clinic });
}

/** O texto e os botões de uma mensagem (sem "1 - ..." no texto: a pessoa toca no botão). */
export function renderMessage(step: MessageStep, ctx: Pick<FlowContext, 'vars'>, lastMessage: string): Omit<FlowOutMessage, 'stepId'> {
  const texto = renderText(step.text, ctx, lastMessage);
  if (step.buttons.length === 0) return { text: texto };
  return {
    // A Meta não manda botão sem texto.
    text: texto || 'Escolha uma opção:',
    buttons: step.buttons.map((b) => ({ id: `bot:${step.id}:${b.id}`, title: b.label })),
  };
}

/** Qual botão a pessoa escolheu: tocado, número, o texto do botão ou um sinônimo. */
export function matchButton(step: MessageStep, input: { text: string; buttonId?: string | null }): FlowButton | null {
  if (input.buttonId) {
    const b = step.buttons.find((x) => input.buttonId === `bot:${step.id}:${x.id}`);
    if (b) return b;
  }
  const t = normalize(input.text);
  if (!t) return null;
  const num = /^(?:opcao |op )?(\d{1,2})$/.exec(t);
  if (num) return step.buttons[Number(num[1]) - 1] ?? null;
  return (
    step.buttons.find((b) => normalize(b.label) === t) ??
    step.buttons.find((b) => b.synonyms.some((s) => normalize(s) && (normalize(s) === t || hasWord(input.text, s)))) ??
    null
  );
}

const lista = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function ruleHolds(r: FlowRule, ctx: FlowContext, msg: string): boolean {
  switch (r.subject) {
    case 'message': {
      const t = normalize(msg);
      if (r.op === 'empty') return !t;
      if (r.op === 'notEmpty') return Boolean(t);
      if (r.op === 'equals') return lista(r.value).some((v) => normalize(v) === t);
      if (r.op === 'starts') return lista(r.value).some((v) => Boolean(normalize(v)) && t.startsWith(normalize(v)));
      return lista(r.value).some((v) => hasWord(msg, v));
    }
    case 'tag':
      return r.op === 'hasNot' ? !ctx.tagIds.includes(r.ref ?? '') : ctx.tagIds.includes(r.ref ?? '');
    case 'stage':
      return r.op === 'isNot' ? ctx.stageId !== r.ref : ctx.stageId === r.ref;
    case 'source':
      return r.op === 'isNot' ? ctx.source !== r.value : ctx.source === r.value;
    case 'field': {
      const v = (ctx.fields[r.ref ?? ''] ?? '').trim();
      if (r.op === 'filled') return Boolean(v);
      if (r.op === 'empty') return !v;
      return normalize(v) === normalize(r.value ?? '');
    }
    case 'hours':
      return r.op === 'outside' ? !ctx.open : ctx.open;
  }
}

/** Qual caso da condição bate (o primeiro), ou `else`. */
export function evaluateCondition(step: ConditionStep, ctx: FlowContext, msg: string): string {
  for (const c of step.cases) {
    if (c.rules.length === 0) continue;
    const ok = c.match === 'any' ? c.rules.some((r) => ruleHolds(r, ctx, msg)) : c.rules.every((r) => ruleHolds(r, ctx, msg));
    if (ok) return `c:${c.id}`;
  }
  return 'else';
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cpfValido(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dig = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

export function validate(check: ValidateCheck, value: string | undefined, msg: string): boolean {
  const t = msg.trim();
  switch (check) {
    case 'email':
      return EMAIL.test(t);
    case 'phone': {
      const d = t.replace(/\D/g, '');
      return d.length >= 10 && d.length <= 13;
    }
    case 'number':
      return /^-?\d+([.,]\d+)?$/.test(t.replace(/\s/g, ''));
    case 'cpf':
      return cpfValido(t);
    case 'contains':
      return lista(value).some((v) => hasWord(t, v));
    case 'equals':
      return lista(value).some((v) => normalize(v) === normalize(t));
    case 'minLength':
      return t.length >= Math.max(1, Number(value) || 1);
  }
}

const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/**
 * Um passo do robô. Começa no início (`start`), continua de onde esperava
 * (`message`, `timer`) e anda até esperar ou parar.
 */
export function runFlow(doc: FlowDoc, state: FlowState | null, event: FlowEvent, ctxIn: FlowContext): FlowResult {
  const ctx: FlowContext = { ...ctxIn, tagIds: [...ctxIn.tagIds], fields: { ...ctxIn.fields } };
  const messages: FlowOutMessage[] = [];
  const effects: FlowEffect[] = [];
  const visited: string[] = [];
  const lastMessage = event.kind === 'timer' ? '' : (event.text ?? '').trim().slice(0, 1000);
  let misses = state?.misses ?? 0;

  const fim = (): FlowResult => ({ messages, effects, state: null, visited });
  const esperar = (stepId: string, wakeAt: Date | null): FlowResult => ({ messages, effects, state: { stepId, misses, wakeAt }, visited });

  // De onde seguir.
  let proximo: string | undefined;
  if (event.kind === 'start') {
    proximo = doc.start;
    misses = 0;
  } else {
    const atual = state ? doc.steps[state.stepId] : undefined;
    if (!atual) return fim();
    visited.push(atual.id);
    if (atual.type === 'message') {
      if (event.kind === 'timer') {
        proximo = atual.out.timeout;
        if (!proximo) return fim();
      } else {
        const b = atual.buttons.length ? matchButton(atual, event) : null;
        if (b) proximo = atual.out[`b:${b.id}`];
        else proximo = atual.out.other ?? (atual.buttons.length ? `__retry__:${atual.id}` : undefined);
        if (!proximo) return fim();
        // Tocou num botão: zera o "não entendi". Outra resposta: o contador segue (vale para a condição que leva ao "não entendi").
        if (b) misses = 0;
      }
    } else if (atual.type === 'pause') {
      proximo = event.kind === 'timer' ? atual.out.timer : atual.out.message;
      if (!proximo) return fim();
    } else {
      return fim();
    }
  }

  for (let passos = 0; proximo && passos < MAX_STEPS_PER_RUN; passos++) {
    // "Não entendi" interno (saída "outra resposta" sem ligação num passo com botões).
    if (proximo.startsWith('__retry__:')) {
      const alvo = doc.steps[proximo.slice(10)];
      if (!alvo || alvo.type !== 'message') return fim();
      if (misses >= 1) {
        messages.push({ stepId: alvo.id, text: FLOW_HANDOFF_TEXT });
        effects.push({ type: 'handoff', stepId: alvo.id });
        return fim();
      }
      misses += 1;
      const r = renderMessage(alvo, ctx, lastMessage);
      messages.push({ stepId: alvo.id, text: FLOW_MISS_TEXT, buttons: r.buttons });
      return esperar(alvo.id, alvo.timeoutMinutes ? addMinutes(ctx.now, alvo.timeoutMinutes) : null);
    }

    const step: FlowStep | undefined = doc.steps[proximo];
    if (!step) return fim();
    visited.push(step.id);

    switch (step.type) {
      case 'message': {
        const r = renderMessage(step, ctx, lastMessage);
        if (r.text.trim() || r.buttons) messages.push({ stepId: step.id, ...r });
        if (step.buttons.length || step.waitReply) {
          misses = 0;
          return esperar(step.id, step.timeoutMinutes ? addMinutes(ctx.now, step.timeoutMinutes) : null);
        }
        proximo = step.out.next;
        break;
      }
      case 'condition':
        proximo = step.out[evaluateCondition(step, ctx, lastMessage)];
        break;
      case 'pause': {
        if (!step.waitMessage && !step.minutes) {
          proximo = step.out.timer;
          break;
        }
        return esperar(step.id, step.minutes ? addMinutes(ctx.now, step.minutes) : null);
      }
      case 'validate':
        proximo = step.out[validate(step.check, step.value, lastMessage) ? 'valid' : 'invalid'];
        break;
      case 'action': {
        for (const a of step.actions) {
          if (a.type === 'setField') {
            const valor = a.from === 'lastMessage' ? lastMessage : renderText(a.value ?? '', ctx, lastMessage);
            if (!valor.trim()) continue;
            effects.push({ ...a, from: 'value', value: valor, stepId: step.id });
            if (a.field.startsWith('field:')) ctx.fields[a.field.slice(6)] = valor;
            continue;
          }
          if (a.type === 'note' || a.type === 'notify' || a.type === 'task') {
            effects.push({ ...a, text: renderText(a.text, ctx, lastMessage), stepId: step.id });
            continue;
          }
          effects.push({ ...a, stepId: step.id });
          if (a.type === 'tag' && !ctx.tagIds.includes(a.tagId)) ctx.tagIds.push(a.tagId);
          if (a.type === 'untag') ctx.tagIds = ctx.tagIds.filter((t) => t !== a.tagId);
          if (a.type === 'stage') ctx.stageId = a.stageId;
          if (a.type === 'createLead' && a.stageId && !ctx.stageId) ctx.stageId = a.stageId;
        }
        proximo = step.out.next;
        break;
      }
      case 'goto': {
        const alvo = doc.steps[step.target];
        if (!alvo) return fim();
        if (step.mode === 'retry' && alvo.type === 'message') {
          proximo = `__retry__:${alvo.id}`;
          break;
        }
        if (step.mode === 'silent' && alvo.type === 'message' && (alvo.buttons.length || alvo.waitReply)) {
          misses = 0;
          return esperar(alvo.id, alvo.timeoutMinutes ? addMinutes(ctx.now, alvo.timeoutMinutes) : null);
        }
        proximo = alvo.id;
        break;
      }
      case 'startBot':
        effects.push({ type: 'startBot', botId: step.botId, stepId: step.id });
        return fim();
      case 'roundRobin': {
        if (step.options.length === 0) return fim();
        const i = ((ctx.roundRobin(step.id, step.options.length) % step.options.length) + step.options.length) % step.options.length;
        proximo = step.out[`r:${step.options[i].id}`];
        break;
      }
      case 'handoff': {
        const t = renderText(step.text || FLOW_HANDOFF_TEXT, ctx, lastMessage);
        if (t) messages.push({ stepId: step.id, text: t });
        effects.push({ type: 'handoff', stepId: step.id });
        return fim();
      }
      case 'stop':
        return fim();
    }
  }
  return fim();
}

// ─── Saídas de cada passo (o quadro desenha uma bolinha por saída) ────────────

export interface FlowHandle {
  key: string;
  label: string;
}

export function stepHandles(step: FlowStep): FlowHandle[] {
  switch (step.type) {
    case 'message':
      if (step.buttons.length === 0 && !step.waitReply) return [{ key: 'next', label: 'Seguir' }];
      return [
        ...step.buttons.map((b) => ({ key: `b:${b.id}`, label: b.label || 'Botão' })),
        { key: 'other', label: step.buttons.length ? 'Outra resposta' : 'Resposta' },
        ...(step.timeoutMinutes ? [{ key: 'timeout', label: 'Sem resposta' }] : []),
      ];
    case 'condition':
      return [...step.cases.map((c, i) => ({ key: `c:${c.id}`, label: c.label || `Caso ${i + 1}` })), { key: 'else', label: 'Senão' }];
    case 'pause':
      return [...(step.waitMessage ? [{ key: 'message', label: 'Mensagem recebida' }] : []), ...(step.minutes || !step.waitMessage ? [{ key: 'timer', label: 'Tempo esgotado' }] : [])];
    case 'validate':
      return [
        { key: 'valid', label: 'Válido' },
        { key: 'invalid', label: 'Inválido' },
      ];
    case 'action':
      return [{ key: 'next', label: 'Seguir' }];
    case 'roundRobin':
      return step.options.map((o, i) => ({ key: `r:${o.id}`, label: o.label || `Opção ${i + 1}` }));
    default:
      return [];
  }
}

// ─── Leitura, validação e conversão dos robôs antigos ─────────────────────────

export const isFlowDoc = (raw: unknown): raw is FlowDoc =>
  Boolean(raw) && (raw as FlowDoc).version === 2 && typeof (raw as FlowDoc).start === 'string' && typeof (raw as FlowDoc).steps === 'object';

/** Problemas antes de salvar (ou null). */
export function flowProblem(doc: FlowDoc): string | null {
  const ids = Object.keys(doc.steps);
  if (ids.length === 0 || !doc.steps[doc.start]) return 'O robô precisa de um primeiro passo.';
  if (ids.length > 200) return 'No máximo 200 passos por robô.';
  const h = doc.hours;
  if (h && h.mode !== 'always') {
    const ok = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!ok.test(h.start) || !ok.test(h.end) || h.start >= h.end) return 'Confira o horário de atendimento (o começo vem antes do fim).';
    if (!h.days.length) return 'Marque pelo menos um dia de atendimento.';
  }
  for (const [i, s] of Object.values(doc.steps).entries()) {
    const n = `Passo ${i + 1}`;
    for (const alvo of Object.values(s.out)) if (alvo && !doc.steps[alvo]) return `${n}: uma seta aponta para um passo que não existe.`;
    if (s.type === 'message') {
      if (!s.text.trim() && s.buttons.length === 0) return `${n}: escreva a mensagem.`;
      if (s.buttons.length > 10) return `${n}: no máximo 10 botões por mensagem.`;
      for (const b of s.buttons) {
        if (!b.label.trim()) return `${n}: todo botão precisa de um texto.`;
        if (b.label.trim().length > 24) return `${n}: o texto do botão tem no máximo 24 letras (limite do WhatsApp).`;
      }
    }
    if (s.type === 'condition' && s.cases.length === 0) return `${n}: a condição precisa de pelo menos um caso.`;
    if (s.type === 'goto' && !doc.steps[s.target]) return `${n}: escolha para qual passo ir.`;
    if (s.type === 'roundRobin' && (s.options.length < 2 || s.options.length > 10)) return `${n}: o rodízio tem de 2 a 10 opções.`;
    if (s.type === 'pause' && s.minutes != null && (s.minutes < 1 || s.minutes > 60 * 24 * 30)) return `${n}: a pausa vai de 1 minuto a 30 dias.`;
    if (s.type === 'action') {
      if (s.actions.length === 0) return `${n}: escolha pelo menos uma ação.`;
      for (const a of s.actions) {
        if ((a.type === 'tag' || a.type === 'untag') && !a.tagId) return `${n}: escolha a tag.`;
        if (a.type === 'stage' && !a.stageId) return `${n}: escolha a etapa.`;
        if (a.type === 'assign' && !a.userId) return `${n}: escolha o responsável.`;
        if ((a.type === 'task' || a.type === 'note' || a.type === 'notify') && !a.text.trim()) return `${n}: escreva o texto da ${a.type === 'task' ? 'tarefa' : a.type === 'note' ? 'anotação' : 'mensagem para a equipe'}.`;
        if (a.type === 'setField' && a.from === 'value' && !(a.value ?? '').trim()) return `${n}: escreva o valor do campo.`;
      }
    }
    if (s.type === 'condition') {
      for (const c of s.cases) {
        for (const r of c.rules) {
          if ((r.subject === 'tag' || r.subject === 'stage' || r.subject === 'field') && !r.ref) return `${n}: complete a condição (escolha a tag, etapa ou campo).`;
          if (r.subject === 'message' && (r.op === 'contains' || r.op === 'equals' || r.op === 'starts') && !(r.value ?? '').trim()) return `${n}: escreva as palavras da condição.`;
        }
      }
    }
    if (s.type === 'startBot' && !s.botId) return `${n}: escolha qual robô iniciar.`;
  }
  return null;
}

export { DEFAULT_HOURS };
