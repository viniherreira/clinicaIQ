import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOURS,
  EMAIL_RETRY_TEXT,
  fillVars,
  fitsAudience,
  hasWord,
  pickBot,
  readAudience,
  HANDOFF_TEXT,
  isOpenAt,
  shouldStart,
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
  it('o texto sem "1 - ..." e as opções como botões com id do menu', () => {
    const r = renderStep(FLOW.steps.inicio);
    expect(r.text).toBe('Oi! Sou o assistente da clínica. Como posso ajudar?');
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
    expect(a.messages[0].text).not.toContain('1 - ');
    expect(a.messages[0].buttons?.[0]).toEqual({ id: 'bot:inicio:agendar', title: 'Agendar avaliação' });
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

describe('pergunta aberta e horário', () => {
  const flow: BotSteps = {
    start: 'q',
    steps: { q: { id: 'q', kind: 'question', text: 'Qual seu e-mail?', options: [], saveTo: 'email', answer: { reply: 'Valeu!' } } },
  };

  it('e-mail que não parece e-mail: pede de novo uma vez; na segunda, segue sem guardar', () => {
    const d1 = continueBot(flow, { stepId: 'q', misses: 0 }, { text: 'ana' });
    expect(d1.messages[0].text).toBe(EMAIL_RETRY_TEXT);
    expect(d1.next).toEqual({ stepId: 'q', misses: 1 });
    const d2 = continueBot(flow, { stepId: 'q', misses: 1 }, { text: 'ana' });
    expect(d2.actions).toEqual([]);
    expect(d2.messages.map((m) => m.text)).toEqual(['Valeu!']);
    expect(d2.next).toBeNull();
  });

  it('pergunta não tem botões', () => {
    expect(startBot(flow).messages[0]).toEqual({ text: 'Qual seu e-mail?', buttons: undefined });
  });

  // Segunda, 13/10/2026: 10h e 20h em Brasília.
  const dezHoras = new Date('2026-10-13T13:00:00Z');
  const vinteHoras = new Date('2026-10-13T23:00:00Z');
  const domingo = new Date('2026-10-11T13:00:00Z');

  it('horário de atendimento no fuso de Brasília', () => {
    expect(isOpenAt(DEFAULT_HOURS, dezHoras)).toBe(true);
    expect(isOpenAt(DEFAULT_HOURS, vinteHoras)).toBe(false);
    expect(isOpenAt(DEFAULT_HOURS, domingo)).toBe(false);
  });

  it('robô de fora do horário só começa com a clínica fechada', () => {
    const fora = { ...DEFAULT_HOURS, mode: 'outside' as const };
    expect(shouldStart(fora, dezHoras)).toBe(false);
    expect(shouldStart(fora, vinteHoras)).toBe(true);
    expect(shouldStart({ ...DEFAULT_HOURS, mode: 'inside' }, dezHoras)).toBe(true);
    expect(shouldStart(undefined, vinteHoras)).toBe(true);
  });

  it('horário invertido não salva', () => {
    expect(stepsProblem({ ...flow, hours: { ...DEFAULT_HOURS, mode: 'outside', start: '18:00', end: '08:00' } })).toMatch(/horário/);
  });
});

describe('público por tag', () => {
  it.each([
    [{ anyTags: [], noneTags: [] }, [], true],
    [{ anyTags: ['implante'], noneTags: [] }, [], false],
    [{ anyTags: ['implante', 'protese'], noneTags: [] }, ['protese'], true],
    [{ anyTags: [], noneTags: ['paciente'] }, ['paciente', 'vip'], false],
    [{ anyTags: ['vip'], noneTags: ['paciente'] }, ['vip', 'paciente'], false],
  ])('%o com as tags %o → %s', (aud, tags, esperado) => expect(fitsAudience(aud, tags)).toBe(esperado));

  it('lê o que veio do banco sem confiar', () => {
    expect(readAudience({ anyTags: ['a', 'a', 3, ''], noneTags: 'x' })).toEqual({ anyTags: ['a'], noneTags: [] });
    expect(readAudience(null)).toEqual({ anyTags: [], noneTags: [] });
  });

  it('escolhe o robô: palavra-chave primeiro; o que pede tag antes do geral; fora do público não conta', () => {
    const menu = FLOW;
    const geral = { id: 'geral', trigger: 'NEW_CONTACT' as const, keywords: [], steps: menu };
    const implante = { id: 'implante', trigger: 'NEW_CONTACT' as const, keywords: [], steps: { ...menu, audience: { anyTags: ['t-impl'], noneTags: [] } } };
    const palavra = { id: 'menu', trigger: 'KEYWORD' as const, keywords: ['menu'], steps: menu };
    const flows = [geral, implante, palavra];
    const now = new Date('2026-10-14T15:00:00Z');
    expect(pickBot(flows, { text: 'oi', newContact: true, tagIds: ['t-impl'], now })?.id).toBe('implante');
    expect(pickBot(flows, { text: 'oi', newContact: true, tagIds: [], now })?.id).toBe('geral');
    expect(pickBot(flows, { text: 'Menu', newContact: true, tagIds: ['t-impl'], now })?.id).toBe('menu');
    expect(pickBot(flows, { text: 'oi', newContact: false, tagIds: [], now })).toBeNull();
  });
});

describe('respostas personalizadas (como a Condição do Salesbot)', () => {
  const comRegras: BotSteps = {
    start: 'inicio',
    steps: {
      ...FLOW.steps,
      inicio: {
        ...FLOW.steps.inicio,
        text: 'Oi, {primeiro_nome}! Como posso ajudar?',
        rules: [
          { id: 'r1', keywords: ['preço', 'valor', 'quanto custa'], reply: 'Os valores dependem da avaliação, {primeiro_nome}.', then: 'menu', actions: [{ type: 'tag', tagId: 'preco' }] },
          { id: 'r2', keywords: ['urgente', 'dor'], reply: 'Vou chamar a recepção agora.', then: 'handoff' },
          { id: 'r3', keywords: ['convênio'], reply: 'Atendemos Amil e Unimed.', then: 'stay' },
        ],
      },
      q: {
        id: 'q',
        kind: 'question',
        text: 'Qual tratamento você procura?',
        options: [],
        saveTo: 'note',
        answer: { reply: 'Anotado! A equipe já te responde.' },
        rules: [{ id: 'q1', keywords: ['implante'], reply: 'Implante é com a Dra. Flávia. Quer agendar?', then: 'end', actions: [{ type: 'tag', tagId: 'implante' }] }],
      },
    },
  };
  const vars = { name: 'Ana Souza', clinic: 'Sorriso' };

  it('variáveis: nome, primeiro nome e clínica; sem nome não sobra vírgula', () => {
    expect(fillVars('Oi, {primeiro_nome}! Aqui é da {clinica}.', vars)).toBe('Oi, Ana! Aqui é da Sorriso.');
    expect(fillVars('Oi, {primeiro_nome}!', { name: '' })).toBe('Oi!');
    expect(fillVars('Oi {primeiro_nome}, tudo bem?', { name: '(11) •••••-1234' })).toBe('Oi, tudo bem?');
    expect(fillVars('{nome}', { name: 'Contato do WhatsApp' })).toBe('');
    expect(startBot(comRegras, vars).messages[0].text).toMatch(/^Oi, Ana! Como posso ajudar\?/);
  });

  it('palavra inteira, sem acento, plural vale', () => {
    expect(hasWord('Qual o PRECO?', 'preço')).toBe(true);
    expect(hasWord('quanto custam os valores', 'valor')).toBe(true);
    expect(hasWord('quanto custa o clareamento', 'quanto custa')).toBe(true);
    expect(hasWord('dorme bem', 'dor')).toBe(false);
  });

  it('no menu, quem escreve em vez de tocar recebe a resposta certa', () => {
    const d = continueBot(comRegras, { stepId: 'inicio', misses: 0 }, { text: 'quanto custa um clareamento?' }, vars);
    expect(d.messages[0].text).toBe('Os valores dependem da avaliação, Ana.');
    expect(d.messages[1].text).toMatch(/^Oi, Ana! Como posso ajudar/);
    expect(d.actions).toEqual([{ type: 'tag', tagId: 'preco' }]);
    expect(d.next).toEqual({ stepId: 'inicio', misses: 0 });

    const urg = continueBot(comRegras, { stepId: 'inicio', misses: 0 }, { text: 'estou com muita dor' });
    expect(urg.actions).toEqual([{ type: 'handoff' }]);
    expect(urg.next).toBeNull();

    const fica = continueBot(comRegras, { stepId: 'inicio', misses: 1 }, { text: 'aceita convenio?' });
    expect(fica.messages.map((m) => m.text)).toEqual(['Atendemos Amil e Unimed.']);
    expect(fica.next).toEqual({ stepId: 'inicio', misses: 0 });
  });

  it('botão tocado vale mais que a palavra; sem regra, segue o "não entendi"', () => {
    expect(continueBot(comRegras, { stepId: 'inicio', misses: 0 }, { text: 'Valores', buttonId: 'bot:inicio:valores' }).next?.stepId).toBe('valores');
    expect(continueBot(comRegras, { stepId: 'inicio', misses: 0 }, { text: 'hein?' }).messages[0].text).toMatch(/^Não entendi/);
  });

  it('na pergunta: guarda a resposta e responde do jeito combinado; sem palavra, o padrão', () => {
    const d = continueBot(comRegras, { stepId: 'q', misses: 0 }, { text: 'Quero fazer implantes' });
    expect(d.messages.map((m) => m.text)).toEqual(['Implante é com a Dra. Flávia. Quer agendar?']);
    expect(d.actions).toEqual([
      { type: 'save', field: 'note', question: 'Qual tratamento você procura?', value: 'Quero fazer implantes' },
      { type: 'tag', tagId: 'implante' },
    ]);
    expect(continueBot(comRegras, { stepId: 'q', misses: 0 }, { text: 'lente' }).messages[0].text).toBe('Anotado! A equipe já te responde.');
  });

  it('validação: regra sem palavra ou sem resposta não salva', () => {
    const sem = (r: object) => ({ ...comRegras, steps: { ...comRegras.steps, inicio: { ...comRegras.steps.inicio, rules: [r as never] } } });
    expect(stepsProblem(sem({ id: 'x', keywords: [' '], reply: 'oi', then: 'end' }))).toMatch(/pelo menos uma palavra/);
    expect(stepsProblem(sem({ id: 'x', keywords: ['oi'], reply: '', then: 'end' }))).toMatch(/texto ou de uma ação/);
    expect(stepsProblem(comRegras)).toBeNull();
  });
});
