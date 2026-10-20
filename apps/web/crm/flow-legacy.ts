import { EMAIL_RETRY_TEXT, parseSteps, type BotAction, type BotRule, type BotStep, type BotSteps } from './bot-engine';
import { isFlowDoc, stepHandles, type FlowAction, type FlowDoc, type FlowStep } from './flow-engine';

/**
 * Robôs do formato antigo (menu de botões com submenu, pergunta e respostas
 * personalizadas) viram o formato de passos ligados, sem mudar o que fazem.
 * Puro e testado em `flow-legacy.test.ts`. Também arruma as caixas no quadro
 * quando o robô ainda não tem posição salva.
 */

type Then = { kind: 'step'; id: string } | { kind: 'silent'; id: string } | { kind: 'handoff' } | { kind: 'end' };

export function fromLegacy(old: BotSteps): FlowDoc {
  const steps: Record<string, FlowStep> = {};
  let seq = 0;
  const nid = (base: string) => `${base}__${(seq++).toString(36)}`;

  const crm = (acts: BotAction[] | undefined): FlowAction[] =>
    (acts ?? []).flatMap((a): FlowAction[] => {
      if (a.type === 'createLead') return [{ type: 'createLead', ...(a.stageId ? { stageId: a.stageId } : {}) }];
      if (a.type === 'stage') return [{ type: 'stage', stageId: a.stageId }];
      if (a.type === 'tag') return [{ type: 'tag', tagId: a.tagId }];
      if (a.type === 'assign') return [{ type: 'assign', userId: a.userId }];
      return [];
    });

  /** Resposta → ações → para onde vai. Devolve o primeiro passo da corrente. */
  function chain(base: string, reply: string | undefined, acts: BotAction[] | undefined, then: Then, before: FlowAction[] = []): string | undefined {
    const texto = reply?.trim() ?? '';
    let next: string | undefined;
    if (then.kind === 'step') next = then.id;
    else if (then.kind === 'silent') {
      const id = nid(`${base}_volta`);
      steps[id] = { id, type: 'goto', target: then.id, mode: 'silent', out: {} };
      next = id;
    } else if (then.kind === 'handoff') {
      const id = nid(`${base}_equipe`);
      // Com resposta escrita, ela é a despedida; sem, a frase padrão.
      steps[id] = { id, type: 'handoff', text: texto, out: {} };
      next = id;
    }
    const acoes = [...before, ...crm(acts)];
    if (acoes.length) {
      const id = nid(`${base}_acao`);
      steps[id] = { id, type: 'action', actions: acoes, out: { next } };
      next = id;
    }
    if (texto && then.kind !== 'handoff') {
      const id = nid(`${base}_resposta`);
      steps[id] = { id, type: 'message', text: texto, buttons: [], waitReply: false, timeoutMinutes: null, out: { next } };
      next = id;
    }
    return next;
  }

  const thenOf = (acts: BotAction[] | undefined, next: string | undefined): Then =>
    (acts ?? []).some((a) => a.type === 'handoff') ? { kind: 'handoff' } : next && old.steps[next] ? { kind: 'step', id: next } : { kind: 'end' };

  /** As respostas personalizadas viram uma condição na "outra resposta". */
  function rules(s: BotStep, rs: BotRule[], elseTo: string | undefined, before: FlowAction[]): string {
    const id = nid(`${s.id}_regras`);
    const out: Record<string, string | undefined> = { else: elseTo };
    const cases = rs.map((r) => {
      const then: Then =
        r.then === 'handoff'
          ? { kind: 'handoff' }
          : r.then === 'menu'
            ? { kind: 'step', id: old.start }
            : r.then === 'stay'
              ? s.kind === 'question'
                ? { kind: 'silent', id: s.id }
                : { kind: 'silent', id: s.id }
              : { kind: 'end' };
      out[`c:${r.id}`] = chain(`${s.id}_${r.id}`, r.reply, r.actions, then, before);
      return { id: r.id, label: r.keywords.slice(0, 3).join(', '), match: 'any' as const, rules: [{ subject: 'message' as const, op: 'contains', value: r.keywords.join(', ') }] };
    });
    steps[id] = { id, type: 'condition', cases, out };
    return id;
  }

  for (const s of Object.values(old.steps)) {
    if (s.kind === 'question') {
      const salvar: FlowAction[] = s.saveTo ? [{ type: 'setField', field: s.saveTo, from: 'lastMessage', question: s.text.trim() }] : [];
      const resposta = s.answer ?? {};
      const thenAnswer = thenOf(resposta.actions, resposta.next);
      const comSalvar = chain(`${s.id}_ok`, resposta.reply, resposta.actions, thenAnswer, salvar);
      let padrao = comSalvar;
      if (s.saveTo === 'email') {
        // E-mail que não parece e-mail: pede de novo uma vez; na segunda, segue sem guardar.
        const semSalvar = chain(`${s.id}_sem`, resposta.reply, resposta.actions, thenOf(resposta.actions, resposta.next));
        const val2 = nid(`${s.id}_valida2`);
        steps[val2] = { id: val2, type: 'validate', check: 'email', out: { valid: comSalvar, invalid: semSalvar } };
        const denovo = nid(`${s.id}_denovo`);
        steps[denovo] = { id: denovo, type: 'message', text: EMAIL_RETRY_TEXT, buttons: [], waitReply: true, timeoutMinutes: null, out: { other: val2 } };
        const val = nid(`${s.id}_valida`);
        steps[val] = { id: val, type: 'validate', check: 'email', out: { valid: comSalvar, invalid: denovo } };
        padrao = val;
      }
      const other = s.rules?.length ? rules(s, s.rules, padrao, salvar) : padrao;
      steps[s.id] = { id: s.id, type: 'message', text: s.text, buttons: [], waitReply: true, timeoutMinutes: null, out: { other } };
      continue;
    }
    const out: Record<string, string | undefined> = {};
    for (const o of s.options) out[`b:${o.id}`] = chain(`${s.id}_${o.id}`, o.reply, o.actions, thenOf(o.actions, o.next));
    if (s.rules?.length) {
      const retry = nid(`${s.id}_naoentendi`);
      steps[retry] = { id: retry, type: 'goto', target: s.id, mode: 'retry', out: {} };
      out.other = rules(s, s.rules, retry, []);
    }
    steps[s.id] = {
      id: s.id,
      type: 'message',
      text: s.text,
      buttons: s.options.map((o) => ({ id: o.id, label: o.label, synonyms: [] })),
      waitReply: true,
      timeoutMinutes: null,
      out,
    };
  }

  const doc: FlowDoc = { version: 2, start: old.start, steps, ...(old.hours ? { hours: old.hours } : {}), ...(old.audience ? { audience: old.audience } : {}) };
  return { ...doc, layout: autoLayout(doc) };
}

/** Lê `ChatbotFlow.steps`: formato novo como está; antigo, convertido. */
export function readFlow(raw: unknown): FlowDoc | null {
  if (isFlowDoc(raw)) return raw.steps[raw.start] ? { ...raw, layout: { ...autoLayout(raw), ...(raw.layout ?? {}) } } : null;
  const old = parseSteps(raw);
  return old ? fromLegacy(old) : null;
}

const COL = 340;
const ROW = 190;

/**
 * Posição das caixas: colunas pela distância do primeiro passo (da esquerda
 * para a direita, como o Kommo), uma embaixo da outra em cada coluna. Passos
 * soltos vão para a última coluna.
 */
export function autoLayout(doc: Pick<FlowDoc, 'start' | 'steps'>): Record<string, { x: number; y: number }> {
  const nivel = new Map<string, number>();
  const fila = [doc.start];
  nivel.set(doc.start, 0);
  while (fila.length) {
    const id = fila.shift()!;
    const s = doc.steps[id];
    if (!s) continue;
    const alvos = [...stepHandles(s).map((h) => s.out[h.key]), ...(s.type === 'goto' ? [] : [])];
    for (const a of alvos) {
      if (a && doc.steps[a] && !nivel.has(a)) {
        nivel.set(a, nivel.get(id)! + 1);
        fila.push(a);
      }
    }
  }
  const ultimo = Math.max(0, ...nivel.values()) + 1;
  const porColuna = new Map<number, number>();
  const pos: Record<string, { x: number; y: number }> = {};
  for (const id of [...nivel.keys(), ...Object.keys(doc.steps).filter((k) => !nivel.has(k))]) {
    const col = nivel.get(id) ?? ultimo;
    const linha = porColuna.get(col) ?? 0;
    porColuna.set(col, linha + 1);
    pos[id] = { x: col * COL, y: linha * ROW };
  }
  return pos;
}
