import { describe, expect, it } from 'vitest';
import { continueBot, startBot, type BotSteps } from './bot-engine';
import { flowProblem, runFlow, stepHandles, type FlowContext, type FlowDoc, type FlowResult, type FlowState } from './flow-engine';
import { autoLayout, fromLegacy, readFlow } from './flow-legacy';

const NOW = new Date('2026-10-20T15:00:00Z');
const ctx = (over: Partial<FlowContext> = {}): FlowContext => ({
  now: NOW,
  tagIds: [],
  stageId: null,
  source: null,
  fields: {},
  open: true,
  vars: { name: 'Ana Souza', clinic: 'Sorriso' },
  roundRobin: () => 0,
  ...over,
});

/** Conversa: começa e responde em sequência; devolve cada rodada. */
function conversa(doc: FlowDoc, falas: (string | { timer: true })[], c: FlowContext = ctx()): FlowResult[] {
  const out: FlowResult[] = [];
  let estado: FlowState | null = null;
  const r0 = runFlow(doc, null, { kind: 'start' }, c);
  out.push(r0);
  estado = r0.state;
  for (const f of falas) {
    const r = runFlow(doc, estado, typeof f === 'string' ? { kind: 'message', text: f } : { kind: 'timer' }, c);
    out.push(r);
    estado = r.state;
  }
  return out;
}
const textos = (r: FlowResult) => r.messages.map((m) => m.text);

// ─── O robô antigo, convertido, faz o mesmo ─────────────────────────────────

const LEGADO: BotSteps = {
  start: 'inicio',
  steps: {
    inicio: {
      id: 'inicio',
      text: 'Oi, {primeiro_nome}! Como posso ajudar?',
      options: [
        { id: 'agendar', label: 'Agendar avaliação', reply: 'Já vou te passar para a recepção.', actions: [{ type: 'createLead', stageId: 'novo' }, { type: 'handoff' }] },
        { id: 'valores', label: 'Valores', next: 'valores' },
        { id: 'endereco', label: 'Endereço', reply: 'Rua das Flores, 120.', next: 'inicio' },
        { id: 'nome', label: 'Deixar meu e-mail', next: 'q_email', actions: [{ type: 'createLead' }] },
      ],
      rules: [
        { id: 'r1', keywords: ['preço', 'valor'], reply: 'Depende da avaliação, {primeiro_nome}.', then: 'menu', actions: [{ type: 'tag', tagId: 'preco' }] },
        { id: 'r2', keywords: ['dor', 'urgente'], reply: 'Vou chamar a recepção agora.', then: 'handoff' },
        { id: 'r3', keywords: ['convênio'], reply: 'Atendemos Amil.', then: 'stay' },
      ],
    },
    valores: {
      id: 'valores',
      text: 'Qual tratamento?',
      options: [{ id: 'clareamento', label: 'Clareamento', reply: 'Começa em R$ 900.', actions: [{ type: 'tag', tagId: 'clareamento' }] }],
    },
    q_email: { id: 'q_email', kind: 'question', text: 'Qual é o seu e-mail?', options: [], saveTo: 'email', answer: { reply: 'Obrigado!' } },
  },
};
const vars = { name: 'Ana Souza', clinic: 'Sorriso' };
const doc = fromLegacy(LEGADO);

describe('robô antigo convertido para passos', () => {
  it('nada se perde: o fluxo é válido e começa pelo mesmo menu', () => {
    expect(flowProblem(doc)).toBeNull();
    const [r] = conversa(doc, []);
    expect(r.messages).toEqual(startBot(LEGADO, vars).messages.map((m) => ({ ...m, stepId: 'inicio' })));
    expect(r.state).toEqual({ stepId: 'inicio', misses: 0, wakeAt: null });
  });

  it.each([
    ['submenu e opção final com tag', ['2', 'clareamento']],
    ['agendar: cria o lead e passa para a equipe', ['1']],
    ['endereço responde e volta ao menu', ['3']],
    ['não entendeu duas vezes: chama a equipe', ['hein', 'hã?']],
    ['resposta personalizada que mostra o menu', ['quanto custa o valor?']],
    ['resposta personalizada que chama a equipe', ['estou com dor']],
    ['resposta personalizada que continua esperando', ['aceita convênio?', '3']],
    ['e-mail certo é guardado', ['4', 'ana@x.com']],
    ['e-mail errado pede de novo uma vez e segue sem guardar', ['4', 'ana', 'ana de novo']],
  ])('%s — mesmas mensagens que o motor antigo', (_, falas) => {
    // O motor antigo, rodada a rodada.
    const antigo: string[][] = [startBot(LEGADO, vars).messages.map((m) => m.text)];
    let st: { stepId: string; misses: number } | null = startBot(LEGADO, vars).next;
    for (const f of falas) {
      if (!st) break;
      const d = continueBot(LEGADO, st, { text: f }, vars);
      antigo.push(d.messages.map((m) => m.text));
      st = d.next;
    }
    const novo = conversa(doc, falas).map(textos);
    expect(novo.slice(0, antigo.length)).toEqual(antigo);
  });

  it('as ações no CRM saem iguais (sem o "guardar" do antigo, que virou preencher campo)', () => {
    const r = conversa(doc, ['2', 'clareamento']);
    expect(r[2].effects.map(({ stepId: _, ...e }) => e)).toEqual([{ type: 'tag', tagId: 'clareamento' }]);
    const ag = conversa(doc, ['1']);
    expect(ag[1].effects.map((e) => e.type)).toEqual(['createLead', 'handoff']);
    const em = conversa(doc, ['4', 'ana@x.com']);
    expect(em[2].effects.map(({ stepId: _, ...e }) => e)).toEqual([
      { type: 'setField', field: 'email', from: 'value', value: 'ana@x.com', question: 'Qual é o seu e-mail?' },
    ]);
    expect(em[2].state).toBeNull();
  });

  it('readFlow lê os dois formatos e arruma as caixas', () => {
    expect(readFlow(LEGADO)?.version).toBe(2);
    const novo = readFlow({ ...doc, layout: undefined });
    expect(novo?.layout?.inicio).toEqual({ x: 0, y: 0 });
    expect(Object.keys(autoLayout(doc))).toHaveLength(Object.keys(doc.steps).length);
    expect(readFlow({ nada: 1 })).toBeNull();
  });
});

// ─── Os passos do Kommo ──────────────────────────────────────────────────────

const KOMMO: FlowDoc = {
  version: 2,
  start: 'boas',
  steps: {
    boas: {
      id: 'boas',
      type: 'message',
      text: 'Olá, {{nome}}! Bem-vinda à {{clinica}}. Quer agendar?',
      buttons: [
        { id: 'sim', label: 'Sim', synonyms: ['quero', 'pode ser'] },
        { id: 'nao', label: 'Agora não', synonyms: [] },
      ],
      waitReply: true,
      timeoutMinutes: 60,
      out: { 'b:sim': 'tag', 'b:nao': 'tchau', other: 'cond', timeout: 'lembrete' },
    },
    tag: { id: 'tag', type: 'action', actions: [{ type: 'tag', tagId: 'quente' }, { type: 'stage', stageId: 'conversa' }], out: { next: 'quente?' } },
    'quente?': {
      id: 'quente?',
      type: 'condition',
      cases: [{ id: 'q', label: 'Quente e no horário', match: 'all', rules: [{ subject: 'tag', op: 'has', ref: 'quente' }, { subject: 'hours', op: 'inside' }] }],
      out: { 'c:q': 'equipe', else: 'email' },
    },
    equipe: { id: 'equipe', type: 'handoff', text: 'Já chamo a recepção, {{primeiro_nome}}!', out: {} },
    email: { id: 'email', type: 'message', text: 'Fora do horário. Deixa seu e-mail?', buttons: [], waitReply: true, timeoutMinutes: null, out: { other: 'valida' } },
    valida: { id: 'valida', type: 'validate', check: 'email', out: { valid: 'salva', invalid: 'email' } },
    salva: { id: 'salva', type: 'action', actions: [{ type: 'setField', field: 'email', from: 'lastMessage' }, { type: 'note', text: 'Pediu contato: {{ultima_mensagem}}' }], out: { next: 'fim' } },
    fim: { id: 'fim', type: 'message', text: 'Anotado!', buttons: [], waitReply: false, timeoutMinutes: null, out: {} },
    tchau: { id: 'tchau', type: 'stop', out: {} },
    cond: {
      id: 'cond',
      type: 'condition',
      cases: [{ id: 'preco', match: 'any', rules: [{ subject: 'message', op: 'contains', value: 'preço, valor' }] }],
      out: { 'c:preco': 'preco', else: 'volta' },
    },
    preco: { id: 'preco', type: 'message', text: 'A avaliação é sem custo.', buttons: [], waitReply: false, timeoutMinutes: null, out: { next: 'volta' } },
    volta: { id: 'volta', type: 'goto', target: 'boas', mode: 'silent', out: {} },
    lembrete: { id: 'lembrete', type: 'pause', waitMessage: true, minutes: 1440, out: { message: 'boas', timer: 'rr' } },
    rr: { id: 'rr', type: 'roundRobin', options: [{ id: 'a', label: 'Bia' }, { id: 'b', label: 'Caio' }], out: { 'r:a': 'paraBia', 'r:b': 'outro' } },
    paraBia: { id: 'paraBia', type: 'action', actions: [{ type: 'assign', userId: 'bia' }], out: {} },
    outro: { id: 'outro', type: 'startBot', botId: 'reativacao', out: {} },
  },
};

describe('passos do Salesbot', () => {
  it('variáveis {{nome}} e {{clinica}}; botões com o id do passo; espera com hora para acordar', () => {
    const [r] = conversa(KOMMO, []);
    expect(r.messages[0]).toEqual({
      stepId: 'boas',
      text: 'Olá, Ana Souza! Bem-vinda à Sorriso. Quer agendar?',
      buttons: [
        { id: 'bot:boas:sim', title: 'Sim' },
        { id: 'bot:boas:nao', title: 'Agora não' },
      ],
    });
    expect(r.state).toEqual({ stepId: 'boas', misses: 0, wakeAt: new Date('2026-10-20T16:00:00Z') });
  });

  it('sinônimo vale como botão; ação muda o contexto e a condição seguinte já vê a tag', () => {
    const r = conversa(KOMMO, ['quero sim'])[1];
    expect(r.effects.map((e) => e.type)).toEqual(['tag', 'stage', 'handoff']);
    expect(textos(r)).toEqual(['Já chamo a recepção, Ana!']);
    expect(r.visited).toEqual(['boas', 'tag', 'quente?', 'equipe']);
    expect(r.state).toBeNull();
  });

  it('fora do horário: pede o e-mail, valida, guarda, anota e termina', () => {
    const c = ctx({ open: false });
    const r = conversa(KOMMO, ['1', 'ana', 'ana@x.com'], c);
    expect(textos(r[1])).toEqual(['Fora do horário. Deixa seu e-mail?']);
    expect(textos(r[2])).toEqual(['Fora do horário. Deixa seu e-mail?']);
    expect(r[3].effects.map(({ stepId: _, ...e }) => e)).toEqual([
      { type: 'setField', field: 'email', from: 'value', value: 'ana@x.com' },
      { type: 'note', text: 'Pediu contato: ana@x.com' },
    ]);
    expect(textos(r[3])).toEqual(['Anotado!']);
    expect(r[3].state).toBeNull();
  });

  it('outra resposta: condição pela mensagem; "silent" volta a esperar sem repetir', () => {
    const r = conversa(KOMMO, ['qual o valor?'])[1];
    expect(textos(r)).toEqual(['A avaliação é sem custo.']);
    expect(r.state).toEqual({ stepId: 'boas', misses: 0, wakeAt: new Date('2026-10-20T16:00:00Z') });
    const s = conversa(KOMMO, ['oi?'])[1];
    expect(s.messages).toEqual([]);
    expect(s.state?.stepId).toBe('boas');
  });

  it('sem resposta: o tempo leva à pausa; na pausa, mensagem volta ao começo e o tempo leva ao rodízio', () => {
    const r = conversa(KOMMO, [{ timer: true }]);
    expect(r[1].state).toEqual({ stepId: 'lembrete', misses: 0, wakeAt: new Date('2026-10-21T15:00:00Z') });
    const msg = runFlow(KOMMO, r[1].state, { kind: 'message', text: 'oi' }, ctx());
    expect(msg.state?.stepId).toBe('boas');
    const bia = runFlow(KOMMO, r[1].state, { kind: 'timer' }, ctx({ roundRobin: () => 0 }));
    expect(bia.effects.map(({ stepId: _, ...e }) => e)).toEqual([{ type: 'assign', userId: 'bia' }]);
    const caio = runFlow(KOMMO, r[1].state, { kind: 'timer' }, ctx({ roundRobin: () => 3 }));
    expect(caio.effects.map(({ stepId: _, ...e }) => e)).toEqual([{ type: 'startBot', botId: 'reativacao' }]);
  });

  it('laço sem fim para no teto de passos', () => {
    const laco: FlowDoc = {
      version: 2,
      start: 'a',
      steps: {
        a: { id: 'a', type: 'goto', target: 'b', mode: 'send', out: {} },
        b: { id: 'b', type: 'goto', target: 'a', mode: 'send', out: {} },
      },
    };
    const r = runFlow(laco, null, { kind: 'start' }, ctx());
    expect(r.state).toBeNull();
    expect(r.visited.length).toBeLessThanOrEqual(50);
  });

  it('saídas de cada passo (as bolinhas do quadro)', () => {
    expect(stepHandles(KOMMO.steps.boas).map((h) => h.label)).toEqual(['Sim', 'Agora não', 'Outra resposta', 'Sem resposta']);
    expect(stepHandles(KOMMO.steps['quente?']).map((h) => h.key)).toEqual(['c:q', 'else']);
    expect(stepHandles(KOMMO.steps.lembrete).map((h) => h.key)).toEqual(['message', 'timer']);
  });

  it('validação antes de salvar', () => {
    expect(flowProblem(KOMMO)).toBeNull();
    const ruim = (patch: object) => ({ ...KOMMO, steps: { ...KOMMO.steps, ...patch } }) as FlowDoc;
    expect(flowProblem(ruim({ boas: { ...KOMMO.steps.boas, out: { other: 'nao-existe' } } }))).toMatch(/não existe/);
    expect(flowProblem(ruim({ rr: { ...KOMMO.steps.rr, options: [{ id: 'a', label: 'só um' }] } }))).toMatch(/2 a 10/);
    expect(flowProblem({ ...KOMMO, start: 'x' })).toMatch(/primeiro passo/);
  });
});
