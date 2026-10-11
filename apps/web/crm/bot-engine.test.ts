import { describe, expect, it } from 'vitest';
import {
  HANDOFF_TEXT,
  botExpired,
  continueBot,
  isKeyword,
  matchOption,
  normalize,
  renderStep,
  startBot,
  stepsProblem,
  type BotSteps,
} from './bot-engine';

const FLOW: BotSteps = {
  start: 'inicio',
  steps: {
    inicio: {
      id: 'inicio',
      text: 'Oi! Sou o assistente da clínica. Como posso ajudar?',
      options: [
        { id: 'agendar', label: 'Agendar avaliação', reply: 'Ótimo! Já vou te passar para a recepção marcar.', actions: [{ type: 'createLead', stageId: 'novo' }, { type: 'handoff' }] },
        { id: 'valores', label: 'Valores', next: 'valores' },
        { id: 'endereco', label: 'Endereço', reply: 'Rua das Flores, 120 — Centro.', next: 'inicio' },
      ],
    },
    valores: {
      id: 'valores',
      text: 'Qual tratamento?',
      options: [
        { id: 'clareamento', label: 'Clareamento', reply: 'O clareamento começa em R$ 900.', actions: [{ type: 'tag', tagId: 'clareamento' }] },
        { id: 'implante', label: 'Implante', reply: 'O implante começa em R$ 3.800.' },
      ],
    },
  },
};

describe('renderStep', () => {
  it('opções numeradas no texto e os botões com id do menu', () => {
    const r = renderStep(FLOW.steps.inicio);
    expect(r.text).toBe('Oi! Sou o assistente da clínica. Como posso ajudar?\n\n1 - Agendar avaliação\n2 - Valores\n3 - Endereço');
    expect(r.buttons[1]).toEqual({ id: 'bot:inicio:valores', title: 'Valores' });
  });
});

describe('matchOption', () => {
  const step = FLOW.steps.inicio;
  it.each([
    [{ text: '2' }, 'valores'],
    [{ text: ' 2. ' }, 'valores'],
    [{ text: 'opção 3' }, 'endereco'],
    [{ text: 'VALORES!' }, 'valores'],
    [{ text: 'agendar avaliacao' }, 'agendar'],
    [{ text: 'Valores', buttonId: 'bot:inicio:endereco' }, 'endereco'],
    [{ text: '9' }, null],
    [{ text: 'quanto custa o implante?' }, null],
    [{ text: '' }, null],
  ])('%j → %s', (input, esperado) => {
    expect(matchOption(step, input)?.id ?? null).toBe(esperado);
  });
});

describe('conversa com o robô', () => {
  it('começa pelo menu inicial', () => {
    const d = startBot(FLOW);
    expect(d.next).toEqual({ stepId: 'inicio', misses: 0 });
    expect(d.messages[0].buttons).toHaveLength(3);
  });

  it('opção com submenu: abre o próximo menu', () => {
    const d = continueBot(FLOW, { stepId: 'inicio', misses: 0 }, { text: '2' });
    expect(d.next).toEqual({ stepId: 'valores', misses: 0 });
    expect(d.messages[0].text).toContain('Qual tratamento?');
  });

  it('opção final: responde, age e o robô para', () => {
    const d = continueBot(FLOW, { stepId: 'valores', misses: 0 }, { text: 'Clareamento' });
    expect(d).toEqual({ messages: [{ text: 'O clareamento começa em R$ 900.' }], actions: [{ type: 'tag', tagId: 'clareamento' }], next: null });
  });

  it('passar para a equipe: responde e para, mesmo que houvesse próximo menu', () => {
    const d = continueBot(FLOW, { stepId: 'inicio', misses: 0 }, { text: '1' });
    expect(d.next).toBeNull();
    expect(d.actions.map((a) => a.type)).toEqual(['createLead', 'handoff']);
    expect(d.messages).toEqual([{ text: 'Ótimo! Já vou te passar para a recepção marcar.' }]);
  });

  it('resposta e volta ao menu', () => {
    const d = continueBot(FLOW, { stepId: 'inicio', misses: 0 }, { text: '3' });
    expect(d.messages.map((m) => m.text.split('\n')[0])).toEqual(['Rua das Flores, 120 — Centro.', 'Oi! Sou o assistente da clínica. Como posso ajudar?']);
    expect(d.next).toEqual({ stepId: 'inicio', misses: 0 });
  });

  it('não entendeu: repete uma vez; na segunda, chama a equipe', () => {
    const a = continueBot(FLOW, { stepId: 'inicio', misses: 0 }, { text: 'hã?' });
    expect(a.next).toEqual({ stepId: 'inicio', misses: 1 });
    expect(a.messages[0].text).toMatch(/^Não entendi/);
    expect(a.messages[0].text).toContain('1 - Agendar avaliação');
    const b = continueBot(FLOW, { stepId: 'inicio', misses: 1 }, { text: 'hã?' });
    expect(b).toEqual({ messages: [{ text: HANDOFF_TEXT }], actions: [{ type: 'handoff' }], next: null });
  });
});

describe('gatilho, validade e cadastro', () => {
  it('palavra-chave sem ligar para acento e caixa', () => {
    expect(isKeyword('Menu!', ['menu', 'oi'])).toBe(true);
    expect(isKeyword('Olá', ['ola'])).toBe(true);
    expect(isKeyword('quero o menu', ['menu'])).toBe(false);
    expect(normalize('  Opção   Três! ')).toBe('opcao tres');
  });

  it('robô parado há mais de 24 h não vale mais', () => {
    const agora = new Date('2026-10-11T12:00:00Z');
    expect(botExpired(new Date('2026-10-10T11:00:00Z'), agora)).toBe(true);
    expect(botExpired(new Date('2026-10-11T11:00:00Z'), agora)).toBe(false);
    expect(botExpired(null, agora)).toBe(true);
  });

  it('cadastro pega os problemas', () => {
    expect(stepsProblem(FLOW)).toBeNull();
    expect(stepsProblem({ start: 'x', steps: {} })).toMatch(/menu inicial/);
    expect(stepsProblem({ start: 'a', steps: { a: { id: 'a', text: 'Oi', options: [{ id: '1', label: 'Uma opção com o nome comprido demais', reply: '' }] } } })).toMatch(/24/);
    expect(stepsProblem({ start: 'a', steps: { a: { id: 'a', text: 'Oi', options: [{ id: '1', label: 'X', next: 'z' }] } } })).toMatch(/não existe/);
  });
});
