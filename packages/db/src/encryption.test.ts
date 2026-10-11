import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, hashForTenant } from './encryption';

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
