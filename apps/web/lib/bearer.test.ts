import { describe, expect, it } from 'vitest';
import { bearerMatches, secretMatches } from './bearer';
import { capabilityToken, isLegacyCuidToken } from './tokens';

const req = (auth?: string) =>
  new Request('https://exemplo.test/api', auth ? { headers: { authorization: auth } } : undefined);

describe('secretMatches', () => {
  it('aceita o segredo correto', () => {
    expect(secretMatches('abc123', 'abc123')).toBe(true);
  });

  it('recusa segredo errado do mesmo tamanho', () => {
    expect(secretMatches('abc124', 'abc123')).toBe(false);
  });

  it('recusa quando o segredo não está configurado', () => {
    // O bug que isso trava: `if (!secret) return true` deixava o cron de
    // lembretes público, e ele dispara WhatsApp para todos os tenants.
    expect(secretMatches('qualquer', undefined)).toBe(false);
    expect(secretMatches('qualquer', '')).toBe(false);
  });

  it('recusa quando nada foi enviado', () => {
    expect(secretMatches(null, 'abc123')).toBe(false);
    expect(secretMatches(undefined, 'abc123')).toBe(false);
  });

  it('recusa comprimentos diferentes sem lançar', () => {
    expect(secretMatches('curto', 'muito-mais-longo')).toBe(false);
  });
});

describe('bearerMatches', () => {
  it('aceita o cabeçalho Bearer correto', () => {
    expect(bearerMatches(req('Bearer segredo'), 'segredo')).toBe(true);
  });

  it('recusa sem o prefixo Bearer', () => {
    expect(bearerMatches(req('segredo'), 'segredo')).toBe(false);
  });

  it('recusa requisição sem cabeçalho', () => {
    expect(bearerMatches(req(), 'segredo')).toBe(false);
  });

  it('não aceita o segredo por outro caminho que não o cabeçalho', () => {
    // O segredo saiu da query string: URL vai para log da Vercel, proxy e
    // histórico do navegador.
    const comQuery = new Request('https://exemplo.test/api?key=segredo');
    expect(bearerMatches(comQuery, 'segredo')).toBe(false);
  });
});

describe('capabilityToken', () => {
  it('gera 256 bits em base64url', () => {
    const t = capabilityToken();
    expect(t).toHaveLength(43); // 32 bytes em base64url, sem padding
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // seguro em URL
  });

  it('não repete', () => {
    const amostra = new Set(Array.from({ length: 500 }, () => capabilityToken()));
    expect(amostra.size).toBe(500);
  });

  it('não produz o formato cuid, que era o problema', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isLegacyCuidToken(capabilityToken())).toBe(false);
    }
  });

  it('reconhece o formato antigo, para a migração', () => {
    expect(isLegacyCuidToken('cmrxridhz0003ju04vxvnof96')).toBe(true);
  });
});
