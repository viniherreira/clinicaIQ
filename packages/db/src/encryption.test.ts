import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, hashForTenant, hashesForTenant, keyVersionOf, currentKeyVersion } from './encryption';

const KEY = 'unit-test-master-key-not-a-real-secret';

describe('encryption (AES-256-GCM, per-tenant)', () => {
  it('round-trips plaintext for the same tenant', () => {
    const cipher = encrypt('123.456.789-00', KEY, 'tenant_a');
    expect(cipher).not.toContain('123.456');
    expect(decrypt(cipher, KEY, 'tenant_a')).toBe('123.456.789-00');
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encrypt('mesmo valor', KEY, 'tenant_a');
    const b = encrypt('mesmo valor', KEY, 'tenant_a');
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY, 'tenant_a')).toBe('mesmo valor');
    expect(decrypt(b, KEY, 'tenant_a')).toBe('mesmo valor');
  });

  it('cannot be decrypted by another tenant (isolation)', () => {
    const cipher = encrypt('segredo', KEY, 'tenant_a');
    expect(() => decrypt(cipher, KEY, 'tenant_b')).toThrow();
  });

  it('cannot be decrypted with the wrong master key', () => {
    const cipher = encrypt('segredo', KEY, 'tenant_a');
    expect(() => decrypt(cipher, 'chave-errada', 'tenant_a')).toThrow();
  });

  it('preserves unicode', () => {
    const value = 'Ação · São Paulo · (11) 99999-0000 · 😀';
    const cipher = encrypt(value, KEY, 'tenant_a');
    expect(decrypt(cipher, KEY, 'tenant_a')).toBe(value);
  });
});

describe('hashForTenant (índice cego)', () => {
  it('é estável: o mesmo valor dá o mesmo código', () => {
    expect(hashForTenant('5511987654321', KEY, 'tenant_a')).toBe(hashForTenant('5511987654321', KEY, 'tenant_a'));
  });

  it('muda de clínica para clínica', () => {
    expect(hashForTenant('5511987654321', KEY, 'tenant_a')).not.toBe(hashForTenant('5511987654321', KEY, 'tenant_b'));
  });

  it('não revela o valor', () => {
    expect(hashForTenant('5511987654321', KEY, 'tenant_a')).not.toContain('98765');
  });
});

/**
 * Chave numerada (achado F-16 da auditoria). `ENCRYPTION_MASTER_KEY` é sempre
 * a chave atual, de número `ENCRYPTION_KEY_VERSION` (1 se não houver); as
 * anteriores ficam em `ENCRYPTION_MASTER_KEY_V<n>` enquanto a troca não acaba.
 */
describe('troca da chave', () => {
  const OLD = KEY;
  const NEW = 'unit-test-second-master-key-not-real';
  const env = process.env;
  const comAmbiente = (vars: Record<string, string | undefined>, fn: () => void) => {
    const antes = { ...env };
    Object.assign(env, vars);
    for (const [k, v] of Object.entries(vars)) if (v === undefined) delete env[k];
    try {
      fn();
    } finally {
      for (const k of Object.keys(vars)) delete env[k];
      Object.assign(env, antes);
    }
  };

  it('com a chave 1 o texto sai igual ao de sempre: sem prefixo', () => {
    comAmbiente({ ENCRYPTION_KEY_VERSION: undefined }, () => {
      const cipher = encrypt('segredo', OLD, 'tenant_a');
      expect(cipher).not.toMatch(/^k\d+\./);
      expect(keyVersionOf(cipher)).toBe(1);
      expect(currentKeyVersion()).toBe(1);
    });
  });

  it('com a chave 2 o texto novo sai com k2. e abre', () => {
    comAmbiente({ ENCRYPTION_KEY_VERSION: '2', ENCRYPTION_MASTER_KEY_V1: OLD }, () => {
      const cipher = encrypt('segredo', NEW, 'tenant_a');
      expect(cipher.startsWith('k2.')).toBe(true);
      expect(keyVersionOf(cipher)).toBe(2);
      expect(decrypt(cipher, NEW, 'tenant_a')).toBe('segredo');
    });
  });

  it('durante a troca, o texto antigo continua abrindo pela chave 1', () => {
    const antigo = encrypt('gravado antes', OLD, 'tenant_a');
    comAmbiente({ ENCRYPTION_KEY_VERSION: '2', ENCRYPTION_MASTER_KEY_V1: OLD }, () => {
      expect(decrypt(antigo, NEW, 'tenant_a')).toBe('gravado antes');
    });
  });

  it('sem a chave antiga configurada, o erro diz qual falta', () => {
    const antigo = encrypt('gravado antes', OLD, 'tenant_a');
    comAmbiente({ ENCRYPTION_KEY_VERSION: '2', ENCRYPTION_MASTER_KEY_V1: undefined }, () => {
      expect(() => decrypt(antigo, NEW, 'tenant_a')).toThrow('ENCRYPTION_MASTER_KEY_V1');
    });
  });

  it('versão inválida não passa calada', () => {
    comAmbiente({ ENCRYPTION_KEY_VERSION: 'dois' }, () => {
      expect(() => encrypt('x', NEW, 'tenant_a')).toThrow('ENCRYPTION_KEY_VERSION');
    });
  });

  it('índice cego: a busca procura pelo código das duas chaves durante a troca', () => {
    const antigo = hashForTenant('5511987654321', OLD, 'tenant_a');
    expect(hashesForTenant('5511987654321', OLD, 'tenant_a')).toEqual([antigo]);
    comAmbiente({ ENCRYPTION_KEY_VERSION: '2', ENCRYPTION_MASTER_KEY_V1: OLD }, () => {
      const novo = hashForTenant('5511987654321', NEW, 'tenant_a');
      expect(novo).not.toBe(antigo);
      expect(hashesForTenant('5511987654321', NEW, 'tenant_a')).toEqual([novo, antigo]);
    });
  });

  it('troca desfeita: de volta à chave 1, o que já foi para a 2 continua achável e abrindo', () => {
    let recifrado = '';
    comAmbiente({ ENCRYPTION_KEY_VERSION: '2', ENCRYPTION_MASTER_KEY_V1: OLD }, () => {
      recifrado = encrypt('já na chave 2', NEW, 'tenant_a');
    });
    comAmbiente({ ENCRYPTION_KEY_VERSION: undefined, ENCRYPTION_MASTER_KEY_V2: NEW }, () => {
      expect(decrypt(recifrado, OLD, 'tenant_a')).toBe('já na chave 2');
      expect(hashesForTenant('5511987654321', OLD, 'tenant_a')).toEqual([
        hashForTenant('5511987654321', OLD, 'tenant_a'),
        hashForTenant('5511987654321', NEW, 'tenant_a'),
      ]);
    });
  });
});
