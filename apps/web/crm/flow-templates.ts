import { DEFAULT_HOURS } from './bot-engine';
import { autoLayout } from './flow-legacy';
import { INTERAGIU_PIPELINE_NAME, NAO_INTERAGIU_PIPELINE_NAME } from './defaults';
import type { ConditionStep, FlowAction, FlowDoc, FlowStep, FlowStepType } from './flow-engine';

/**
 * O catálogo de passos do editor (nome, explicação, cor da caixa), passo em
 * branco de cada tipo e os modelos prontos — tudo sem banco.
 */

export interface StepMeta {
  label: string;
  description: string;
  /** Cor da faixa da caixa no quadro (classes do Tailwind). */
  tone: string;
}

export const STEP_META: Record<FlowStepType, StepMeta> = {
  message: { label: 'Mensagem', description: 'O robô escreve. Pode ter botões (ex.: Agendar, Preços) e esperar a resposta.', tone: 'bg-sky-500' },
  condition: { label: 'Condição', description: 'Escolhe o caminho: se a pessoa escreveu "preço", se tem uma tag, se é fora do horário…', tone: 'bg-violet-500' },
  pause: { label: 'Esperar', description: 'Dá um tempo: espera a pessoa escrever ou passar alguns minutos.', tone: 'bg-amber-500' },
  validate: { label: 'Conferir a resposta', description: 'Confere se a pessoa mandou um e-mail, telefone, CPF ou número válido.', tone: 'bg-teal-500' },
  action: { label: 'Ação no CRM', description: 'Muda a etapa, põe tag, guarda o nome, cria tarefa ou avisa a equipe.', tone: 'bg-emerald-500' },
  goto: { label: 'Voltar a um passo', description: 'Volta para um passo anterior (ex.: repetir o menu).', tone: 'bg-slate-500' },
  startBot: { label: 'Chamar outro robô', description: 'Passa a conversa para outro robô da clínica.', tone: 'bg-indigo-500' },
  roundRobin: { label: 'Rodízio', description: 'Alterna entre caminhos, um de cada vez (ex.: dividir entre atendentes).', tone: 'bg-pink-500' },
  handoff: { label: 'Passar para a equipe', description: 'O robô sai e uma pessoa da equipe continua a conversa.', tone: 'bg-orange-500' },
  stop: { label: 'Encerrar o robô', description: 'O robô para aqui, sem chamar ninguém.', tone: 'bg-red-500' },
};

/** O menu "+ Passo" em grupos, pelo que a pessoa quer fazer. */
export const STEP_GROUPS: { label: string; types: FlowStepType[] }[] = [
  { label: 'Conversar', types: ['message', 'pause', 'validate'] },
  { label: 'Decidir o caminho', types: ['condition', 'goto', 'roundRobin'] },
  { label: 'Fazer no CRM', types: ['action'] },
  { label: 'Terminar', types: ['handoff', 'startBot', 'stop'] },
];

/** A ordem do menu "+ Passo". */
export const STEP_ORDER: FlowStepType[] = ['message', 'condition', 'action', 'pause', 'validate', 'goto', 'roundRobin', 'startBot', 'handoff', 'stop'];

let seq = 0;
export const newId = (p = 's') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newStep(type: FlowStepType, id = newId()): FlowStep {
  switch (type) {
    case 'message':
      return { id, type, text: '', buttons: [], waitReply: false, timeoutMinutes: null, out: {} };
    case 'condition':
      return { id, type, cases: [{ id: newId('c'), label: '', match: 'any', rules: [{ subject: 'message', op: 'contains', value: '' }] }], out: {} };
    case 'pause':
      return { id, type, waitMessage: true, minutes: 60, out: {} };
    case 'validate':
      return { id, type, check: 'email', out: {} };
    case 'action':
      return { id, type, actions: [], out: {} };
    case 'goto':
      return { id, type, target: '', mode: 'send', out: {} };
    case 'startBot':
      return { id, type, botId: '', out: {} };
    case 'roundRobin':
      return { id, type, options: [{ id: newId('r'), label: 'Opção 1' }, { id: newId('r'), label: 'Opção 2' }], out: {} };
    case 'handoff':
      return { id, type, text: '', out: {} };
    case 'stop':
      return { id, type, out: {} };
  }
}

const msg = (id: string, text: string, out: FlowStep['out'] = {}, extra: Partial<Extract<FlowStep, { type: 'message' }>> = {}): FlowStep => ({
  id,
  type: 'message',
  text,
  buttons: [],
  waitReply: false,
  timeoutMinutes: null,
  out,
  ...extra,
});
const btn = (id: string, label: string, synonyms: string[] = []) => ({ id, label, synonyms });
const comLayout = (d: Omit<FlowDoc, 'layout'>): FlowDoc => ({ ...d, layout: autoLayout(d) });

export type FlowTrigger = 'NEW_CONTACT' | 'KEYWORD' | 'STAGE' | 'TAG' | 'NO_REPLY';

/** Os funis e as tags da clínica, para o modelo já apontar para os dela. */
export interface TemplateRefs {
  pipelines: readonly { name: string; columns: readonly { id: string; role: string | null }[] }[];
  tags: readonly { id: string; name: string }[];
}

export interface FlowTemplate {
  key: string;
  title: string;
  description: string;
  name: string;
  trigger: FlowTrigger;
  doc: (refs?: TemplateRefs) => FlowDoc;
}

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** A entrada (papel NEW) do funil com esse nome; vazio se a clínica não tiver. */
export function entryOf(refs: TemplateRefs | undefined, pipelineName: string): string {
  const funil = refs?.pipelines.find((p) => semAcento(p.name) === semAcento(pipelineName));
  return funil?.columns.find((c) => c.role === 'NEW')?.id ?? '';
}

/** A tag da clínica com um desses nomes (sem acento, hífen ou maiúscula). */
export function tagNamed(refs: TemplateRefs | undefined, names: readonly string[]): string | undefined {
  const alvos = names.map(semAcento);
  return refs?.tags.find((t) => alvos.includes(semAcento(t.name)))?.id;
}

/** Os procedimentos do modelo de atendimento e os nomes de tag que cada um aceita. */
const PROCEDIMENTOS = [
  { id: 'limpeza', label: 'Limpeza', synonyms: ['limpar', 'tártaro', 'profilaxia'], tags: ['limpeza'] },
  { id: 'clareamento', label: 'Clareamento', synonyms: ['clarear', 'branquear'], tags: ['clareamento'] },
  { id: 'implante', label: 'Implante', synonyms: ['implantes', 'dente fixo', 'pino'], tags: ['implante', 'implantes'] },
  { id: 'lentes', label: 'Lentes de contato', synonyms: ['lente', 'lentes', 'faceta'], tags: ['lentes', 'lentes de contato', 'lentes dentais', 'facetas'] },
  { id: 'ortodontia', label: 'Aparelho ou alinhador', synonyms: ['aparelho', 'alinhador', 'ortodontia'], tags: ['ortodontia', 'aparelho'] },
  { id: 'urgencia', label: 'Urgência ou dor', synonyms: ['dor', 'urgente', 'urgência', 'emergência'], tags: ['urgencia', 'urgencia dor', 'dor'] },
  { id: 'outros', label: 'Outros', synonyms: ['outro', 'outra coisa'], tags: ['outros', 'outro'] },
] as const;

/** Condição "dentro do horário" (o horário é o do robô). */
const dentroDoHorario = (id: string, sim: string, nao: string): ConditionStep => ({
  id,
  type: 'condition',
  cases: [{ id: 'aberto', label: 'Dentro do horário', match: 'all', rules: [{ subject: 'hours', op: 'inside' }] }],
  out: { 'c:aberto': sim, else: nao },
});

/**
 * O robô de atendimento: pergunta o nome e o procedimento, põe a tag do
 * procedimento (quando a clínica tem uma com esse nome) e, no "aguarde um
 * momento", move o lead para Interagiu; quem para de responder vai para Não
 * interagiu. Clínica sem esses funis: o editor pede a etapa antes de salvar.
 */
function atendimentoDoc(refs?: TemplateRefs): FlowDoc {
  const interagiu = entryOf(refs, INTERAGIU_PIPELINE_NAME);
  const naoInteragiu = entryOf(refs, NAO_INTERAGIU_PIPELINE_NAME);
  const passosProc: Record<string, FlowStep> = {};
  for (const p of PROCEDIMENTOS) {
    const tagId = tagNamed(refs, p.tags);
    const actions: FlowAction[] = [{ type: 'createLead' }];
    if (tagId) actions.push({ type: 'tag', tagId });
    if (p.id === 'urgencia') actions.push({ type: 'notify', text: 'Urgência: paciente com dor no WhatsApp' });
    passosProc[`p_${p.id}`] = { id: `p_${p.id}`, type: 'action', actions, out: { next: 'fim' } };
  }
  const perguntaNome = { other: 'nome', timeout: 'lembrete' };
  return comLayout({
    version: 2,
    start: 'entrada',
    hours: DEFAULT_HOURS,
    steps: {
      entrada: { id: 'entrada', type: 'action', actions: [{ type: 'createLead' }], out: { next: 'boasVindas' } },
      boasVindas: dentroDoHorario('boasVindas', 'bvDentro', 'bvFora'),
      bvDentro: msg('bvDentro', 'Olá! Seja bem-vindo(a) à {{clinica}}. 😊\n\nPara te atender melhor, qual é o seu nome?', perguntaNome, {
        waitReply: true,
        timeoutMinutes: 10,
      }),
      bvFora: msg(
        'bvFora',
        'Olá! Que bom falar com você. 😊\nAgora estamos fora do horário, mas já posso adiantar seu atendimento.\n\nQual é o seu nome?',
        perguntaNome,
        { waitReply: true, timeoutMinutes: 10 },
      ),
      lembrete: msg('lembrete', 'Oi! Ainda está por aí?\nMe conta seu nome para eu seguir com seu atendimento.', { other: 'nome', timeout: 'semResposta' }, {
        waitReply: true,
        timeoutMinutes: 30,
      }),
      nome: {
        id: 'nome',
        type: 'action',
        actions: [{ type: 'createLead' }, { type: 'setField', field: 'name', from: 'lastMessage', question: 'Qual é o seu nome?' }],
        out: { next: 'proc' },
      },
      proc: msg(
        'proc',
        'Prazer, {{primeiro_nome}}! Qual destes procedimentos você procura?',
        { ...Object.fromEntries(PROCEDIMENTOS.map((p) => [`b:${p.id}`, `p_${p.id}`])), other: 'p_outros', timeout: 'semResposta' },
        { buttons: PROCEDIMENTOS.map((p) => btn(p.id, p.label, [...p.synonyms])), waitReply: true, timeoutMinutes: 60 },
      ),
      ...passosProc,
      fim: dentroDoHorario('fim', 'equipe', 'equipeFora'),
      equipe: {
        id: 'equipe',
        type: 'action',
        actions: [
          { type: 'stage', stageId: interagiu },
          { type: 'task', text: 'Responder {{primeiro_nome}} no WhatsApp (robô de atendimento)', dueMinutes: 15 },
        ],
        out: { next: 'consultora' },
      },
      consultora: { id: 'consultora', type: 'handoff', text: 'Aguarde um momento que uma consultora vai entrar em contato com você. 😊', out: {} },
      equipeFora: {
        id: 'equipeFora',
        type: 'action',
        actions: [
          { type: 'stage', stageId: interagiu },
          { type: 'task', text: 'Responder {{primeiro_nome}} (chegou fora do horário)', dueMinutes: 15 },
        ],
        out: { next: 'foraFim' },
      },
      foraFim: { id: 'foraFim', type: 'handoff', text: 'Agora estamos fora do horário. Assim que abrirmos, uma consultora fala com você. 😊', out: {} },
      semResposta: { id: 'semResposta', type: 'action', actions: [{ type: 'createLead' }, { type: 'stage', stageId: naoInteragiu }], out: { next: 'parar' } },
      parar: { id: 'parar', type: 'stop', out: {} },
    },
  });
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    key: 'atendimento',
    title: 'Atendimento (nome e procedimento)',
    description:
      'Pergunta o nome e o procedimento e põe a tag dele. Quem chega ao "aguarde um momento" vai para o funil Interagiu; quem para de responder, para Não interagiu.',
    name: 'Atendimento (nome e procedimento)',
    trigger: 'NEW_CONTACT',
    doc: atendimentoDoc,
  },
  {
    key: 'boas-vindas',
    title: 'Boas-vindas com menu',
    description: 'Cumprimenta pelo nome, mostra agendar / valores / endereço e entende quem escreve "preço", "convênio" ou "dor".',
    name: 'Boas-vindas',
    trigger: 'NEW_CONTACT',
    doc: () =>
      comLayout({
        version: 2,
        start: 'menu',
        hours: DEFAULT_HOURS,
        steps: {
          menu: msg('menu', 'Oi, {{primeiro_nome}}! Aqui é da {{clinica}}. 😊 Como posso te ajudar?', { 'b:agendar': 'lead', 'b:valores': 'valores', 'b:endereco': 'endereco', other: 'entende' }, {
            buttons: [btn('agendar', 'Agendar avaliação', ['agendar', 'marcar', 'consulta']), btn('valores', 'Valores', ['preço', 'valor', 'quanto custa']), btn('endereco', 'Endereço e horário', ['onde fica', 'endereço'])],
            waitReply: true,
          }),
          lead: { id: 'lead', type: 'action', actions: [{ type: 'createLead' }], out: { next: 'equipe' } },
          equipe: { id: 'equipe', type: 'handoff', text: 'Ótimo, {{primeiro_nome}}! Já vou te passar para a recepção marcar o melhor horário.', out: {} },
          valores: msg('valores', 'Os valores dependem da avaliação, que é sem custo. Quer agendar?', { next: 'volta' }),
          endereco: msg('endereco', 'Atendemos de segunda a sexta, das 8h às 18h, e sábado até 12h.', { next: 'volta' }),
          volta: { id: 'volta', type: 'goto', target: 'menu', mode: 'silent', out: {} },
          entende: {
            id: 'entende',
            type: 'condition',
            cases: [
              { id: 'convenio', label: 'Convênio', match: 'any', rules: [{ subject: 'message', op: 'contains', value: 'convênio, plano, reembolso' }] },
              { id: 'dor', label: 'Urgência', match: 'any', rules: [{ subject: 'message', op: 'contains', value: 'dor, urgente, urgência, emergência' }] },
            ],
            out: { 'c:convenio': 'convenio', 'c:dor': 'urgente', else: 'naoentendi' },
          },
          convenio: { id: 'convenio', type: 'handoff', text: 'Vou chamar a recepção para confirmar o seu convênio. 😊', out: {} },
          urgente: { id: 'urgente', type: 'action', actions: [{ type: 'notify', text: 'Paciente com urgência no WhatsApp' }], out: { next: 'urgente2' } },
          urgente2: { id: 'urgente2', type: 'handoff', text: 'Sinto muito, {{primeiro_nome}}! Já vou chamar alguém da equipe agora.', out: {} },
          naoentendi: { id: 'naoentendi', type: 'goto', target: 'menu', mode: 'retry', out: {} },
        },
      }),
  },
  {
    key: 'fora-do-horario',
    title: 'Fora do horário',
    description: 'Fora do expediente, avisa quando a clínica volta, pergunta o nome e deixa o lead pronto para a equipe.',
    name: 'Fora do horário',
    trigger: 'NEW_CONTACT',
    doc: () =>
      comLayout({
        version: 2,
        start: 'aviso',
        hours: { ...DEFAULT_HOURS, mode: 'outside' },
        steps: {
          aviso: msg('aviso', 'Oi! Agora estamos fora do horário (seg a sex, 8h às 18h). Posso adiantar seu atendimento? Qual é o seu nome?', { other: 'salva' }, { waitReply: true }),
          salva: { id: 'salva', type: 'action', actions: [{ type: 'createLead' }, { type: 'setField', field: 'name', from: 'lastMessage', question: 'Qual é o seu nome?' }], out: { next: 'fim' } },
          fim: msg('fim', 'Obrigado, {{primeiro_nome}}! Amanhã cedo a recepção fala com você. 😊'),
        },
      }),
  },
  {
    key: 'qualificacao',
    title: 'Qualificação',
    description: 'Pergunta o tratamento e quando a pessoa quer começar, põe as tags e passa o lead pronto para a equipe.',
    name: 'Qualificação',
    trigger: 'NEW_CONTACT',
    doc: () =>
      comLayout({
        version: 2,
        start: 'trat',
        hours: DEFAULT_HOURS,
        steps: {
          trat: msg('trat', 'Oi, {{primeiro_nome}}! Qual tratamento você procura?', { 'b:impl': 'tagImpl', 'b:est': 'tagEst', 'b:out': 'quando', other: 'quando' }, {
            buttons: [btn('impl', 'Implante', ['implante', 'dente fixo']), btn('est', 'Estética', ['clareamento', 'lente', 'botox']), btn('out', 'Outro')],
            waitReply: true,
          }),
          tagImpl: { id: 'tagImpl', type: 'action', actions: [{ type: 'createLead' }, { type: 'tag', tagId: '' }], out: { next: 'quando' } },
          tagEst: { id: 'tagEst', type: 'action', actions: [{ type: 'createLead' }, { type: 'tag', tagId: '' }], out: { next: 'quando' } },
          quando: msg('quando', 'E quando você gostaria de começar?', { 'b:ja': 'quente', 'b:mes': 'equipe', 'b:pesq': 'equipe', other: 'equipe' }, {
            buttons: [btn('ja', 'O quanto antes', ['logo', 'agora', 'urgente']), btn('mes', 'Neste mês'), btn('pesq', 'Só pesquisando')],
            waitReply: true,
          }),
          quente: { id: 'quente', type: 'action', actions: [{ type: 'notify', text: 'Lead quente: quer começar o quanto antes' }], out: { next: 'equipe' } },
          equipe: { id: 'equipe', type: 'handoff', text: 'Perfeito! Já vou te passar para a nossa equipe. 😊', out: {} },
        },
      }),
  },
  {
    key: 'reativacao',
    title: 'Reativação de quem sumiu',
    description: 'Quando a pessoa para de responder por um tempo, pergunta se ainda tem interesse e age conforme a resposta.',
    name: 'Reativação',
    trigger: 'NO_REPLY',
    doc: () =>
      comLayout({
        version: 2,
        start: 'pergunta',
        hours: { ...DEFAULT_HOURS, mode: 'inside' },
        steps: {
          pergunta: msg('pergunta', 'Oi, {{primeiro_nome}}! Ainda tem interesse em agendar sua avaliação?', { 'b:sim': 'equipe', 'b:nao': 'perdido', timeout: 'tarefa' }, {
            buttons: [btn('sim', 'Sim, quero', ['sim', 'quero', 'pode']), btn('nao', 'Não, obrigado', ['nao', 'não'])],
            waitReply: true,
            timeoutMinutes: 60 * 24,
          }),
          equipe: { id: 'equipe', type: 'handoff', text: 'Que bom! Já vou chamar a recepção para marcar. 😊', out: {} },
          perdido: msg('perdido', 'Tudo bem! Se precisar, é só chamar.', { next: 'nota' }),
          nota: { id: 'nota', type: 'action', actions: [{ type: 'note', text: 'Disse que não tem mais interesse.' }], out: {} },
          tarefa: { id: 'tarefa', type: 'action', actions: [{ type: 'task', text: 'Ligar: não respondeu à reativação', dueMinutes: 60 }], out: {} },
        },
      }),
  },
];

/** Robô em branco: uma mensagem. */
export function blankFlow(): FlowDoc {
  return comLayout({ version: 2, start: 'inicio', hours: DEFAULT_HOURS, steps: { inicio: msg('inicio', 'Oi, {{primeiro_nome}}! Como posso ajudar?') } });
}

/** O gatilho em português, na pílula de começo do quadro e na lista de robôs. */
export function triggerLabel(meta: { trigger: FlowTrigger; keywords: string[] }, doc: FlowDoc, refs: { stages: { id: string; name: string }[]; tags: { id: string; name: string }[] }): string {
  const nomes = (l: { id: string; name: string }[], ids?: string[]) => (ids ?? []).map((x) => l.find((o) => o.id === x)?.name ?? '?').join(', ');
  switch (meta.trigger) {
    case 'NEW_CONTACT':
      return 'Número novo escreve';
    case 'KEYWORD':
      return meta.keywords.length ? `Escreve ${meta.keywords.map((k) => `“${k}”`).join(' ou ')}` : 'Palavra-chave (escolha)';
    case 'STAGE':
      return doc.trigger?.stageIds?.length ? `Lead entra em ${nomes(refs.stages, doc.trigger.stageIds)}` : 'Lead entra numa etapa (escolha)';
    case 'TAG':
      return doc.trigger?.tagIds?.length ? `Tag ${nomes(refs.tags, doc.trigger.tagIds)}` : 'Tag posta (escolha)';
    case 'NO_REPLY':
      return `Sem resposta há ${doc.trigger?.hours ?? 24} h`;
  }
}

