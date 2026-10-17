import { DEFAULT_HOURS, readAudience, type BotAction, type BotAudience, type BotHours, type BotOption, type BotSaveField, type BotStep, type BotSteps } from './bot-engine';

/**
 * O robô como a tela edita, em linguagem de gente: um menu de botões e, em
 * cada botão, o que o robô responde, o que faz no CRM (etapa, tags,
 * responsável) e o que vem depois (encerrar, voltar ao menu, abrir outro
 * menu, fazer uma pergunta ou chamar a equipe). Vira o formato do motor
 * (`BotSteps`) ao salvar e volta ao abrir.
 */

export type UiAfter = 'end' | 'menu' | 'sub' | 'question' | 'handoff';
/** Depois de responder a pergunta. */
export type UiQuestionAfter = 'end' | 'menu' | 'handoff';

/** '' = não mexe no funil; NEW_STAGE = cria o lead na entrada; id = cria/move para a etapa. */
export const NEW_STAGE = '__entrada__';

export interface UiQuestion {
  text: string;
  saveTo: BotSaveField;
  reply: string;
  after: UiQuestionAfter;
}

export interface UiOption {
  id: string;
  label: string;
  reply: string;
  stage: string;
  tagIds: string[];
  assignTo: string;
  after: UiAfter;
  sub?: UiMenu;
  question?: UiQuestion;
}

export interface UiMenu {
  text: string;
  options: UiOption[];
}

let n = 0;
export const newOptionId = () => `o${Date.now().toString(36)}${(n++).toString(36)}`;

export const blankOption = (label = ''): UiOption => ({
  id: newOptionId(),
  label,
  reply: '',
  stage: '',
  tagIds: [],
  assignTo: '',
  after: 'end',
});

export const blankQuestion = (): UiQuestion => ({ text: 'Qual é o seu nome?', saveTo: 'name', reply: 'Obrigado! 😊', after: 'handoff' });

/** Um robô de exemplo para começar (a clínica edita). */
export function exampleMenu(): UiMenu {
  return {
    text: 'Oi! Aqui é da clínica. 😊 Como posso te ajudar?',
    options: [
      { ...blankOption('Agendar avaliação'), reply: 'Ótimo! Já vou te passar para a recepção marcar o melhor horário.', stage: NEW_STAGE, after: 'handoff' },
      { ...blankOption('Valores'), reply: 'Os valores dependem da avaliação, que é sem custo. Quer agendar?', after: 'menu' },
      { ...blankOption('Endereço e horário'), reply: 'Atendemos de segunda a sexta, das 8h às 18h, e sábado até 12h.', after: 'menu' },
    ],
  };
}

/** Modelos prontos para "Novo robô". */
export interface BotTemplate {
  key: string;
  title: string;
  description: string;
  name: string;
  trigger: 'NEW_CONTACT' | 'KEYWORD';
  hours: BotHours;
  menu: () => UiMenu;
}

export const BOT_TEMPLATES: BotTemplate[] = [
  {
    key: 'boas-vindas',
    title: 'Boas-vindas com menu',
    description: 'Cumprimenta quem chama pela primeira vez e mostra as opções: agendar, valores, endereço.',
    name: 'Boas-vindas',
    trigger: 'NEW_CONTACT',
    hours: DEFAULT_HOURS,
    menu: exampleMenu,
  },
  {
    key: 'fora-do-horario',
    title: 'Fora do horário',
    description: 'Fora do expediente, avisa quando a clínica volta, pergunta o nome e deixa o lead pronto para a equipe.',
    name: 'Fora do horário',
    trigger: 'NEW_CONTACT',
    hours: { ...DEFAULT_HOURS, mode: 'outside' },
    menu: () => ({
      text: 'Oi! Agora estamos fora do horário de atendimento (seg a sex, 8h às 18h). Posso adiantar seu atendimento?',
      options: [
        {
          ...blankOption('Quero agendar'),
          stage: NEW_STAGE,
          after: 'question',
          question: { text: 'Qual é o seu nome?', saveTo: 'name', reply: 'Obrigado! Amanhã cedo a recepção fala com você. 😊', after: 'end' },
        },
        { ...blankOption('Só uma dúvida'), reply: 'Pode escrever sua dúvida que respondemos assim que abrirmos.', stage: NEW_STAGE, after: 'end' },
      ],
    }),
  },
  {
    key: 'qualificar',
    title: 'Qualificar o interesse',
    description: 'Pergunta o tratamento e o nome, anota tudo na ficha e passa para a equipe. Dá para pôr uma tag em cada botão.',
    name: 'Qualificação',
    trigger: 'NEW_CONTACT',
    hours: DEFAULT_HOURS,
    menu: () => ({
      text: 'Oi! 😊 Para te atender melhor: qual tratamento te interessa?',
      options: [
        {
          ...blankOption('Implante'),
          stage: NEW_STAGE,
          after: 'question',
          question: { text: 'Perfeito! Qual é o seu nome?', saveTo: 'name', reply: 'Obrigado! Já vou te passar para a equipe.', after: 'handoff' },
        },
        {
          ...blankOption('Estética'),
          stage: NEW_STAGE,
          after: 'question',
          question: { text: 'Perfeito! Qual é o seu nome?', saveTo: 'name', reply: 'Obrigado! Já vou te passar para a equipe.', after: 'handoff' },
        },
        { ...blankOption('Outro'), reply: 'Conta pra gente o que você procura que a equipe já te responde.', stage: NEW_STAGE, after: 'handoff' },
      ],
    }),
  },
];

function actionsOf(o: { stage: string; tagIds: string[]; assignTo: string }, handoff: boolean): BotAction[] {
  const out: BotAction[] = [];
  if (o.stage === NEW_STAGE) out.push({ type: 'createLead' });
  else if (o.stage) out.push({ type: 'createLead', stageId: o.stage }, { type: 'stage', stageId: o.stage });
  for (const t of o.tagIds) out.push({ type: 'tag', tagId: t });
  if (o.assignTo) out.push({ type: 'assign', userId: o.assignTo });
  if (handoff) out.push({ type: 'handoff' });
  return out;
}

function readActions(acts: BotAction[]) {
  const criar = acts.find((a): a is Extract<BotAction, { type: 'createLead' }> => a.type === 'createLead');
  const mover = acts.find((a): a is Extract<BotAction, { type: 'stage' }> => a.type === 'stage');
  const stage = mover ? mover.stageId : criar ? criar.stageId ?? NEW_STAGE : '';
  return {
    stage,
    tagIds: acts.flatMap((a) => (a.type === 'tag' ? [a.tagId] : [])),
    assignTo: acts.find((a): a is Extract<BotAction, { type: 'assign' }> => a.type === 'assign')?.userId ?? '',
    handoff: acts.some((a) => a.type === 'handoff'),
  };
}

export function toSteps(menu: UiMenu, hours?: BotHours, audience?: BotAudience): BotSteps {
  const steps: BotSteps['steps'] = {};
  const build = (m: UiMenu, id: string, parent: string | null) => {
    const options: BotOption[] = m.options.map((o) => {
      const opt: BotOption = { id: o.id, label: o.label.trim() };
      if (o.reply.trim()) opt.reply = o.reply.trim();
      const actions = actionsOf(o, o.after === 'handoff');
      if (actions.length) opt.actions = actions;
      if (o.after === 'menu') opt.next = parent ?? id;
      if (o.after === 'sub' && o.sub && !parent) {
        const subId = `sub_${o.id}`;
        build(o.sub, subId, id);
        opt.next = subId;
      }
      if (o.after === 'question' && o.question) {
        const q = o.question;
        const qId = `q_${o.id}`;
        const step: BotStep = { id: qId, kind: 'question', text: q.text.trim(), options: [], saveTo: q.saveTo, answer: {} };
        if (q.reply.trim()) step.answer!.reply = q.reply.trim();
        if (q.after === 'menu') step.answer!.next = 'inicio';
        if (q.after === 'handoff') step.answer!.actions = [{ type: 'handoff' }];
        steps[qId] = step;
        opt.next = qId;
      }
      return opt;
    });
    steps[id] = { id, text: m.text.trim(), options };
  };
  build(menu, 'inicio', null);
  const publico = audience ? readAudience(audience) : null;
  return {
    start: 'inicio',
    steps,
    ...(hours ? { hours } : {}),
    ...(publico && (publico.anyTags.length || publico.noneTags.length) ? { audience: publico } : {}),
  };
}

export function fromSteps(flow: BotSteps): UiMenu {
  const read = (stepId: string, parent: string | null): UiMenu => {
    const s = flow.steps[stepId];
    return {
      text: s?.text ?? '',
      options: (s?.options ?? []).map((o) => {
        const { stage, tagIds, assignTo, handoff } = readActions(o.actions ?? []);
        let after: UiAfter = 'end';
        let sub: UiMenu | undefined;
        let question: UiQuestion | undefined;
        const alvo = o.next ? flow.steps[o.next] : undefined;
        if (handoff) after = 'handoff';
        else if (alvo?.kind === 'question') {
          after = 'question';
          question = {
            text: alvo.text,
            saveTo: alvo.saveTo ?? 'note',
            reply: alvo.answer?.reply ?? '',
            after: (alvo.answer?.actions ?? []).some((a) => a.type === 'handoff') ? 'handoff' : alvo.answer?.next ? 'menu' : 'end',
          };
        } else if (o.next && o.next === (parent ?? stepId)) after = 'menu';
        else if (o.next && !parent) {
          after = 'sub';
          sub = read(o.next, stepId);
        }
        return {
          id: o.id,
          label: o.label,
          reply: o.reply ?? '',
          stage,
          tagIds,
          assignTo,
          after,
          ...(sub ? { sub } : {}),
          ...(question ? { question } : {}),
        };
      }),
    };
  };
  return read(flow.start, null);
}
