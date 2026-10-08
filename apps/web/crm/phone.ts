import { decrypt, encrypt, hashForTenant } from '@clinicaiq/db';
import { normalizeBrazilPhone } from '@/lib/phone';

/**
 * Telefone do lead. Guardado cifrado como o do paciente (LGPD), com um índice
 * cego ao lado para achar duplicados sem decifrar a tabela inteira.
 */

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

/** Forma canônica para comparar: dígitos com código do país. */
export function canonicalPhone(raw: string): string {
  return normalizeBrazilPhone(raw);
}

/** Um telefone serve se tem DDD e número: 10 ou 11 dígitos sem o 55. */
export function isValidPhone(raw: string): boolean {
  return /^55\d{10,11}$/.test(canonicalPhone(raw));
}

export function phoneHash(raw: string, tenantId: string): string {
  return hashForTenant(canonicalPhone(raw), masterKey(), tenantId);
}

export function encryptPhone(raw: string, tenantId: string): string {
  return encrypt(raw.trim(), masterKey(), tenantId);
}

export function decryptPhone(cipher: string, tenantId: string): string {
  try {
    return decrypt(cipher, masterKey(), tenantId);
  } catch {
    // Uma linha que não abre não pode derrubar a tela inteira.
    return '';
  }
}

/**
 * O telefone como aparece no card e na lista: só o fim, para quem passa pela
 * tela não ler o número inteiro. A ficha mostra completo ao clicar.
 */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length < 8) return raw ? '••••' : '';
  const ddd = digits.length >= 10 ? `(${digits.slice(0, 2)}) ` : '';
  return `${ddd}•••••-${digits.slice(-4)}`;
}
