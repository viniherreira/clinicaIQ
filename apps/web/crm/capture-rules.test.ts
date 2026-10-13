import { describe, expect, it } from 'vitest';
import { cleanCaptureKeywords, hasKeyword, matchCapture, type CaptureRuleLite } from './capture-rules';

const regra = (id: string, keywords: string[], extra: Partial<CaptureRuleLite> = {}): CaptureRuleLite => ({
  id,
  name: id,
  keywords,
  tagIds: [`tag_${id}`],
  pipelineId: null,
  source: null,
  ...extra,
});

describe('palavra na mensagem', () => {
  it.each([
    ['Olá, quero saber do implante', 'implante', true],
    ['Vi o anúncio de IMPLANTES dentários', 'implante', true],
    ['quanto custa o clareamento dental?', 'clareamento dental', true],
    ['Clareamento   Dental!!', 'clareamento dental', true],
    ['harmonização facial', 'harmonizacao', true],
    ['oito horas pode?', 'oi', false],
    ['implantodontia', 'implante', false],
    ['', 'implante', false],
  ])('"%s" tem "%s" → %s', (texto, palavra, esperado) => {
    expect(hasKeyword(texto, palavra)).toBe(esperado);
  });
});

describe('regras acionadas', () => {
  it('junta as tags de todas e pega funil e origem da primeira que pede', () => {
    const m = matchCapture('Oi! Vim pelo Instagram, quero implante e clareamento', [
      regra('a', ['implante'], { pipelineId: 'p1' }),
      regra('b', ['instagram'], { source: 'INSTAGRAM', pipelineId: 'p2' }),
      regra('c', ['clareamento'], { tagIds: ['tag_a', 'tag_c'] }),
      regra('d', ['botox']),
    ]);
    expect(m).toEqual({
      hits: [
        { ruleId: 'a', name: 'a', keyword: 'implante' },
        { ruleId: 'b', name: 'b', keyword: 'instagram' },
        { ruleId: 'c', name: 'c', keyword: 'clareamento' },
      ],
      tagIds: ['tag_a', 'tag_b', 'tag_c'],
      pipelineId: 'p1',
      source: 'INSTAGRAM',
    });
  });

  it('nenhuma palavra: nada acontece', () => {
    expect(matchCapture('Boa tarde', [regra('a', ['implante'])])).toBeNull();
  });

  it('limpa as palavras digitadas', () => {
    expect(cleanCaptureKeywords([' Implante ', 'implante', 'Harmonização', '1', 'a', ''])).toEqual(['implante', 'harmonizacao']);
  });
});
