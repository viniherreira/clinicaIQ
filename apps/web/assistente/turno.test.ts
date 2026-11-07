import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { avisoFinal, lerPedido, SEPARADOR_FIM } from './turno';
import { AVISO_CORTADA, AVISO_LIMITE, AVISO_RECUSA, type NovaMensagem } from './loop';

const msg = (role: 'assistant' | 'user', ...textos: string[]): NovaMensagem => ({
  param: { role, content: textos.map((text) => ({ type: 'text' as const, text })) },
  tools: [],
  inputTokens: 0,
  outputTokens: 0,
});

describe('lerPedido', () => {
  it('aceita pergunta com conversa opcional', () => {
    expect(lerPedido({ pergunta: '  quantos amanhã? ' })).toEqual({ ok: true, pergunta: 'quantos amanhã?', conversaId: undefined });
  });
  it('recusa vazia e longa demais', () => {
    expect(lerPedido({ pergunta: '   ' }).ok).toBe(false);
    expect(lerPedido({ pergunta: 'x'.repeat(2001) }).ok).toBe(false);
    expect(lerPedido(null).ok).toBe(false);
  });
  it('separador do fim é um caractere que o modelo não escreve', () => {
    expect(SEPARADOR_FIM).toBe('\u0000');
  });
});

describe('avisoFinal', () => {
  it.each([AVISO_RECUSA, AVISO_LIMITE, AVISO_CORTADA])('devolve o aviso fixo: %s', (aviso) => {
    expect(avisoFinal([msg('user', 'oi'), msg('assistant', aviso)])).toBe(aviso);
  });
  it('junta os blocos de texto da última mensagem', () => {
    expect(avisoFinal([msg('assistant', AVISO_RECUSA.slice(0, 10), AVISO_RECUSA.slice(10))])).toBe(AVISO_RECUSA);
  });
  it('resposta normal não é aviso', () => {
    expect(avisoFinal([msg('user', 'oi'), msg('assistant', 'Temos 3 agendamentos.')])).toBeNull();
  });
  it('última mensagem de usuário ou lista vazia não é aviso', () => {
    expect(avisoFinal([msg('user', AVISO_RECUSA)])).toBeNull();
    expect(avisoFinal([])).toBeNull();
  });
});
