import { describe, expect, it } from 'vitest';
import { stepsProblem } from './bot-engine';
import { exampleMenu, fromSteps, toSteps, type UiMenu } from './bot-form';

const MENU: UiMenu = {
  text: 'Oi! Como posso ajudar?',
  options: [
    { id: 'a', label: 'Agendar', reply: 'Já te passo para a recepção.', action: 'createLead', target: 'st1', after: 'handoff' },
    {
      id: 'b',
      label: 'Valores',
      reply: '',
      action: 'none',
      target: '',
      after: 'sub',
      sub: {
        text: 'Qual tratamento?',
        options: [
          { id: 'c', label: 'Clareamento', reply: 'R$ 900.', action: 'tag', target: 'tg1', after: 'end' },
          { id: 'd', label: 'Voltar', reply: '', action: 'none', target: '', after: 'menu' },
        ],
      },
    },
    { id: 'e', label: 'Endereço', reply: 'Rua A, 10.', action: 'none', target: '', after: 'menu' },
  ],
};

describe('robô na tela ⇄ formato do motor', () => {
  it('menu, submenu, ações e voltas', () => {
    const s = toSteps(MENU);
    expect(s.start).toBe('inicio');
    expect(Object.keys(s.steps).sort()).toEqual(['inicio', 'sub_b']);
    expect(s.steps.inicio.options[0]).toEqual({
      id: 'a',
      label: 'Agendar',
      reply: 'Já te passo para a recepção.',
      actions: [{ type: 'createLead', stageId: 'st1' }, { type: 'handoff' }],
    });
    expect(s.steps.inicio.options[1].next).toBe('sub_b');
    expect(s.steps.inicio.options[2].next).toBe('inicio');
    // "Voltar" no submenu volta ao menu principal.
    expect(s.steps.sub_b.options[1].next).toBe('inicio');
    expect(stepsProblem(s)).toBeNull();
  });

  it('ida e volta mantém o que a clínica escreveu', () => {
    expect(fromSteps(toSteps(MENU))).toEqual(MENU);
  });

  it('o exemplo já é um robô válido', () => {
    expect(stepsProblem(toSteps(exampleMenu()))).toBeNull();
  });
});
