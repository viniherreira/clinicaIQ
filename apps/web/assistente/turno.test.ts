import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ carregarHistorico: vi.fn() }));
vi.mock('./historico', () => ({ carregarHistorico: h.carregarHistorico, criarConversa: vi.fn(), salvarMensagens: vi.fn() }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@clinicaiq/db', () => ({ prisma: {}, getTenantClient: vi.fn() }));
import { avisoFinal, lerPedido, prepararTurno, SEPARADOR_FIM } from './turno';
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
    expect(avisoFinal([msg('user', 'oi'), msg('assistant', aviso)], 'end_turn')).toBe(aviso);
  });
  it('junta os blocos de texto da última mensagem', () => {
    expect(avisoFinal([msg('assistant', AVISO_RECUSA.slice(0, 10), AVISO_RECUSA.slice(10))], 'end_turn')).toBe(AVISO_RECUSA);
  });
  it('resposta normal não é aviso', () => {
    expect(avisoFinal([msg('user', 'oi'), msg('assistant', 'Temos 3 agendamentos.')], 'end_turn')).toBeNull();
  });
  it('última mensagem de usuário ou lista vazia não é aviso', () => {
    expect(avisoFinal([msg('user', AVISO_RECUSA)], 'end_turn')).toBeNull();
    expect(avisoFinal([], 'end_turn')).toBeNull();
  });
  it.each(['max_tokens', 'model_context_window_exceeded'])('resposta cortada (%s) sem aviso no histórico devolve AVISO_CORTADA', (motivo) => {
    expect(avisoFinal([msg('user', 'oi'), msg('assistant', 'parcial')], motivo)).toBe(AVISO_CORTADA);
  });
  it('cortada com aviso já no histórico devolve o aviso que está lá', () => {
    expect(avisoFinal([msg('user', 'oi'), msg('assistant', AVISO_LIMITE)], 'max_tokens')).toBe(AVISO_LIMITE);
  });
});

describe('prepararTurno', () => {
  it('sem conversa: historico vazio, nada e lido', async () => {
    expect(await prepararTurno({ tenantId: 't', userId: 'u' })).toEqual({ ok: true, historico: [] });
    expect(h.carregarHistorico).not.toHaveBeenCalled();
  });
  it('404 quando a conversa nao e do usuario', async () => {
    h.carregarHistorico.mockResolvedValue(null);
    expect(await prepararTurno({ tenantId: 't', userId: 'u', conversaId: 'c' })).toMatchObject({ ok: false, status: 404 });
  });
  it('409 quando o historico nao abre', async () => {
    h.carregarHistorico.mockRejectedValue(new Error('decrypt'));
    expect(await prepararTurno({ tenantId: 't', userId: 'u', conversaId: 'c' })).toMatchObject({ ok: false, status: 409 });
  });
  it('devolve o historico lido', async () => {
    h.carregarHistorico.mockResolvedValue([{ role: 'user', content: 'x' }]);
    expect(await prepararTurno({ tenantId: 't', userId: 'u', conversaId: 'c' })).toEqual({
      ok: true,
      historico: [{ role: 'user', content: 'x' }],
      conversaId: 'c',
    });
  });
});
