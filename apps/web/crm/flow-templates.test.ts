import { describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINES } from './defaults';
import { flowProblem, type ActionStep, type FlowDoc } from './flow-engine';
import { entryOf, FLOW_TEMPLATES, tagNamed, type TemplateRefs } from './flow-templates';

/** Os funis padrão com ids de mentira, como chegam do banco. */
const refs: TemplateRefs = {
  pipelines: DEFAULT_PIPELINES.map((p) => ({
    name: p.name,
    columns: p.stages.map((s) => ({ id: `${p.name}/${s.name}`, role: s.role })),
  })),
  tags: [
    { id: 't-imp', name: 'Implante' },
    { id: 't-urg', name: 'urgencia-dor' },
    { id: 't-len', name: 'lentes-dentais' },
  ],
};

const atendimento = FLOW_TEMPLATES.find((t) => t.key === 'atendimento')!;
const acoes = (doc: FlowDoc, id: string) => (doc.steps[id] as ActionStep).actions;

describe('modelo de robô "Atendimento"', () => {
  it('acha a entrada dos funis pelo nome, sem ligar para acento', () => {
    expect(entryOf(refs, 'Interagiu')).toBe('Interagiu/Aguardando consultora');
    expect(entryOf(refs, 'nao interagiu')).toBe('Não interagiu/Sem resposta');
    expect(entryOf(refs, 'Não existe')).toBe('');
    expect(entryOf(undefined, 'Interagiu')).toBe('');
  });

  it('acha a tag pelo nome, sem ligar para hífen, acento ou maiúscula', () => {
    expect(tagNamed(refs, ['urgencia dor'])).toBe('t-urg');
    expect(tagNamed(refs, ['lentes', 'lentes dentais'])).toBe('t-len');
    expect(tagNamed(refs, ['clareamento'])).toBeUndefined();
  });

  it('no "aguarde um momento" move para Interagiu; sem resposta, para Não interagiu', () => {
    const doc = atendimento.doc(refs);
    expect(acoes(doc, 'equipe')).toContainEqual({ type: 'stage', stageId: 'Interagiu/Aguardando consultora' });
    expect(acoes(doc, 'equipeFora')).toContainEqual({ type: 'stage', stageId: 'Interagiu/Aguardando consultora' });
    expect(acoes(doc, 'semResposta')).toContainEqual({ type: 'stage', stageId: 'Não interagiu/Sem resposta' });
    // Quem para de responder não ganha tag: "não interagiu" é funil.
    expect(acoes(doc, 'semResposta').some((a) => a.type === 'tag')).toBe(false);
  });

  it('cada botão leva à tag do próprio procedimento, quando a clínica tem a tag', () => {
    const doc = atendimento.doc(refs);
    expect(acoes(doc, 'p_implante')).toContainEqual({ type: 'tag', tagId: 't-imp' });
    expect(acoes(doc, 'p_urgencia')).toContainEqual({ type: 'tag', tagId: 't-urg' });
    expect(acoes(doc, 'p_urgencia').some((a) => a.type === 'notify')).toBe(true);
    expect(acoes(doc, 'p_lentes')).toContainEqual({ type: 'tag', tagId: 't-len' });
    // Sem a tag na clínica, o passo só garante o lead (não trava o salvar).
    expect(acoes(doc, 'p_clareamento')).toEqual([{ type: 'createLead' }]);
  });

  it('com os funis padrão, sai pronto para salvar', () => {
    expect(flowProblem(atendimento.doc(refs))).toBeNull();
  });

  it('numa clínica sem esses funis, o editor pede a etapa', () => {
    expect(flowProblem(atendimento.doc())).toMatch(/escolha a etapa/);
  });
});
