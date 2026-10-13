import { describe, expect, it } from 'vitest';
import { continueBot, DEFAULT_HOURS, startBot, stepsProblem } from './bot-engine';
import { BOT_TEMPLATES, blankOption, exampleMenu, fromSteps, NEW_STAGE, toSteps, type UiMenu } from './bot-form';

const MENU: UiMenu = {
  text: 'Oi! Como posso ajudar?',
  options: [
    { ...blankOption('Agendar'), id: 'a', reply: 'Já te passo para a recepção.', stage: 'st1', after: 'handoff' },
    {
      ...blankOption('Valores'),
      id: 'b',
      after: 'sub',
      sub: {
        text: 'Qual tratamento?',
        options: [
          { ...blankOption('Clareamento'), id: 'c', reply: 'R$ 900.', tagIds: ['tg1', 'tg2'], assignTo: 'u1', after: 'end' },
          { ...blankOption('Voltar'), id: 'd', after: 'menu' },
        ],
      },
    },
    { ...blankOption('Endereço'), id: 'e', reply: 'Rua A, 10.', after: 'menu' },
    {
      ...blankOption('Falar comigo'),
      id: 'f',
      stage: NEW_STAGE,
      after: 'question',
      question: { text: 'Qual é o seu e-mail?', saveTo: 'email', reply: 'Anotado!', after: 'handoff' },
    },
  ],
};

describe('robô na tela ⇄ formato do motor', () => {
  it('menu, submenu, pergunta, várias ações e voltas', () => {
    const s = toSteps(MENU, DEFAULT_HOURS);
    expect(s.start).toBe('inicio');
    expect(Object.keys(s.steps).sort()).toEqual(['inicio', 'q_f', 'sub_b']);
    expect(s.steps.inicio.options[0]).toEqual({
      id: 'a',
      label: 'Agendar',
      reply: 'Já te passo para a recepção.',
      actions: [{ type: 'createLead', stageId: 'st1' }, { type: 'stage', stageId: 'st1' }, { type: 'handoff' }],
    });
    expect(s.steps.sub_b.options[0].actions).toEqual([
      { type: 'tag', tagId: 'tg1' },
      { type: 'tag', tagId: 'tg2' },
      { type: 'assign', userId: 'u1' },
    ]);
    expect(s.steps.inicio.options[1].next).toBe('sub_b');
    expect(s.steps.inicio.options[2].next).toBe('inicio');
    // "Voltar" no submenu volta ao menu principal.
    expect(s.steps.sub_b.options[1].next).toBe('inicio');
    expect(s.steps.q_f).toMatchObject({ kind: 'question', saveTo: 'email', answer: { reply: 'Anotado!', actions: [{ type: 'handoff' }] } });
    expect(s.hours).toEqual(DEFAULT_HOURS);
    expect(stepsProblem(s)).toBeNull();
  });

  it('ida e volta mantém o que a clínica escreveu', () => {
    expect(fromSteps(toSteps(MENU))).toEqual(MENU);
  });

  it('robô antigo (uma ação por opção) abre no formato novo', () => {
    const antigo = {
      start: 'inicio',
      steps: {
        inicio: {
          id: 'inicio',
          text: 'Oi',
          options: [{ id: 'x', label: 'Agendar', actions: [{ type: 'createLead' as const, stageId: 's9' }, { type: 'handoff' as const }] }],
        },
      },
    };
    expect(fromSteps(antigo).options[0]).toMatchObject({ stage: 's9', tagIds: [], assignTo: '', after: 'handoff' });
  });

  it('o exemplo e os modelos prontos são robôs válidos', () => {
    expect(stepsProblem(toSteps(exampleMenu()))).toBeNull();
    for (const t of BOT_TEMPLATES) expect(stepsProblem(toSteps(t.menu(), t.hours))).toBeNull();
  });

  it('a pergunta guarda a resposta e chama a equipe', () => {
    const s = toSteps(MENU);
    const d1 = continueBot(s, startBot(s).next!, { text: '4' });
    expect(d1.next?.stepId).toBe('q_f');
    expect(d1.messages.at(-1)?.text).toBe('Qual é o seu e-mail?');
    const d2 = continueBot(s, d1.next!, { text: 'ana@gmail.com' });
    expect(d2.actions).toEqual([{ type: 'save', field: 'email', question: 'Qual é o seu e-mail?', value: 'ana@gmail.com' }, { type: 'handoff' }]);
    expect(d2.next).toBeNull();
  });
});
