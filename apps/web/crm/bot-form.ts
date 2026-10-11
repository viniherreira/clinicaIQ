import type { BotAction, BotOption, BotSteps } from './bot-engine';

/**
 * O robô como a tela edita: um menu principal e, em cada opção, no máximo um
 * submenu. Vira o formato do motor (`BotSteps`) ao salvar e volta ao abrir.
 */

export type UiAction = 'none' | 'createLead' | 'tag' | 'stage' | 'assign';
export type UiAfter = 'end' | 'menu' | 'sub' | 'handoff';

export interface UiOption {
  id: string;
  label: string;
  reply: string;
  action: UiAction;
  /** Etapa (criar lead ou mudar de etapa), tag ou pessoa, conforme a ação. */
  target: string;
  after: UiAfter;
  sub?: UiMenu;
}

export interface UiMenu {
  text: string;
  options: UiOption[];
}

let n = 0;
export const newOptionId = () => `o${Date.now().toString(36)}${(n++).toString(36)}`;

export const blankOption = (label = ''): UiOption => ({ id: newOptionId(), label, reply: '', action: 'none', target: '', after: 'end' });

/** Um robô de exemplo para começar (a clínica edita). */
export function exampleMenu(): UiMenu {
  return {
    text: 'Oi! Aqui é da clínica. 😊 Como posso te ajudar?',
    options: [
      { ...blankOption('Agendar avaliação'), reply: 'Ótimo! Já vou te passar para a recepção marcar o melhor horário.', action: 'createLead', after: 'handoff' },
      { ...blankOption('Valores'), reply: 'Os valores dependem da avaliação, que é sem custo. Quer agendar?', after: 'menu' },
      { ...blankOption('Endereço e horário'), reply: 'Atendemos de segunda a sexta, das 8h às 18h, e sábado até 12h.', after: 'menu' },
    ],
  };
}

function actionsOf(o: UiOption): BotAction[] {
  const out: BotAction[] = [];
  if (o.action === 'createLead') out.push(o.target ? { type: 'createLead', stageId: o.target } : { type: 'createLead' });
  if (o.action === 'tag' && o.target) out.push({ type: 'tag', tagId: o.target });
  if (o.action === 'stage' && o.target) out.push({ type: 'stage', stageId: o.target });
  if (o.action === 'assign' && o.target) out.push({ type: 'assign', userId: o.target });
  if (o.after === 'handoff') out.push({ type: 'handoff' });
  return out;
}

export function toSteps(menu: UiMenu): BotSteps {
  const steps: BotSteps['steps'] = {};
  const build = (m: UiMenu, id: string, parent: string | null) => {
    const options: BotOption[] = m.options.map((o) => {
      const opt: BotOption = { id: o.id, label: o.label.trim() };
      if (o.reply.trim()) opt.reply = o.reply.trim();
      const actions = actionsOf(o);
      if (actions.length) opt.actions = actions;
      if (o.after === 'menu') opt.next = parent ?? id;
      if (o.after === 'sub' && o.sub && !parent) {
        const subId = `sub_${o.id}`;
        build(o.sub, subId, id);
        opt.next = subId;
      }
      return opt;
    });
    steps[id] = { id, text: m.text.trim(), options };
  };
  build(menu, 'inicio', null);
  return { start: 'inicio', steps };
}

export function fromSteps(flow: BotSteps): UiMenu {
  const read = (stepId: string, parent: string | null): UiMenu => {
    const s = flow.steps[stepId];
    return {
      text: s?.text ?? '',
      options: (s?.options ?? []).map((o) => {
        const acts = o.actions ?? [];
        const main = acts.find((a) => a.type !== 'handoff');
        const action: UiAction = (main?.type as UiAction | undefined) ?? 'none';
        const target =
          main?.type === 'createLead' ? main.stageId ?? '' : main?.type === 'tag' ? main.tagId : main?.type === 'stage' ? main.stageId : main?.type === 'assign' ? main.userId : '';
        let after: UiAfter = 'end';
        let sub: UiMenu | undefined;
        if (acts.some((a) => a.type === 'handoff')) after = 'handoff';
        else if (o.next && o.next === (parent ?? stepId)) after = 'menu';
        else if (o.next && !parent) {
          after = 'sub';
          sub = read(o.next, stepId);
        }
        return { id: o.id, label: o.label, reply: o.reply ?? '', action, target, after, ...(sub ? { sub } : {}) };
      }),
    };
  };
  return read(flow.start, null);
}
