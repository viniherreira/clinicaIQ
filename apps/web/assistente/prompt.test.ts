import { describe, expect, it } from 'vitest';
import { MARCA_CONTEXTO, PROMPT_SISTEMA, blocoContexto } from './prompt';

describe('prompt do assistente', () => {
  it('o prompt fixo não tem data nem nada que mude a cada pedido (senão o cache quebra)', () => {
    expect(PROMPT_SISTEMA).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(PROMPT_SISTEMA).toMatch(/somente leitura|só leitura/i);
    expect(PROMPT_SISTEMA).toMatch(/nunca invente/i);
  });

  it('o contexto leva a data de hoje e quem pergunta', () => {
    const b = blocoContexto({ hoje: '2026-11-07', diaSemana: 'sábado', clinica: 'Sorriso', usuario: 'Bia', papel: 'Recepção' });
    expect(b.text.startsWith(MARCA_CONTEXTO)).toBe(true);
    expect(b.text).toContain('2026-11-07 (sábado)');
    expect(b.text).toContain('Recepção');
  });
});
