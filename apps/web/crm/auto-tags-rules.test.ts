import { describe, expect, it } from 'vitest';
import { CHANNEL_TAG, matchProcedures } from './auto-tags-rules';

const tags = (text: string, procs: { id: string; name: string }[] = []) => matchProcedures(text, procs).map((m) => m.tag);

describe('tags de procedimento', () => {
  it.each([
    ['Oi, quero saber o valor do implante', ['implante']],
    ['Vocês fazem IMPLANTES?', ['implante']],
    ['quanto custa clareamento dental', ['clareamento']],
    ['queria colocar aparelho invisível no meu filho', ['aparelho']],
    ['quero fazer lentes de contato e clarear os dentes', ['clareamento', 'lentes de contato']],
    ['preciso tirar o dente do siso', ['extração']],
    ['faço botox e preenchimento labial?', ['botox', 'harmonização facial']],
    ['tenho uma cárie doendo', ['restauração']],
  ])('%s', (texto, esperado) => {
    expect(tags(texto).sort()).toEqual([...esperado].sort());
  });

  it('não acha palavra pela metade nem conversa sem procedimento', () => {
    expect(tags('Oi, bom dia! Qual o horário de vocês?')).toEqual([]);
    expect(tags('meu canal no youtube')).toEqual([]);
    expect(tags('implantação do sistema')).toEqual([]);
  });

  it('liga ao procedimento da clínica para o interesse', () => {
    const procs = [
      { id: 'p1', name: 'Implante unitário' },
      { id: 'p2', name: 'Clareamento a laser' },
    ];
    const m = matchProcedures('quero implante', procs);
    expect(m).toEqual([{ tag: 'implante', procedureId: 'p1', word: 'implante' }]);
    expect(matchProcedures('clareamento', procs)[0]?.procedureId).toBe('p2');
  });

  it('procedimento da clínica fora do dicionário vira tag pelo nome', () => {
    const procs = [
      { id: 'p9', name: 'Ozonioterapia' },
      { id: 'p8', name: 'Consulta de avaliação inicial completa' },
    ];
    expect(matchProcedures('vocês fazem ozonioterapia?', procs)).toEqual([{ tag: 'ozonioterapia', procedureId: 'p9', word: 'Ozonioterapia' }]);
    // Nome comprido demais não vira palavra de busca (ruído).
    expect(tags('quero uma consulta de avaliação inicial completa', procs)).toEqual([]);
  });
});

describe('tags de canal', () => {
  it('canais com tag; manual e outro sem', () => {
    expect(CHANNEL_TAG.WHATSAPP?.name).toBe('whatsapp');
    expect(CHANNEL_TAG.INDICACAO?.name).toBe('indicação');
    expect(CHANNEL_TAG.MANUAL).toBeUndefined();
    expect(CHANNEL_TAG.OUTRO).toBeUndefined();
  });
});
