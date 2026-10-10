import { decrypt, encrypt, hashForTenant } from '@clinicaiq/db';
import { chatKey, normalizeBrazilPhone } from '@/lib/phone';

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

/**
 * Índice cego da conversa de WhatsApp desse telefone. Usa a chave de conversa
 * (celular sempre com o 9), a mesma que o gateway grava.
 */
export function conversationHash(raw: string, tenantId: string): string {
  return hashForTenant(chatKey(raw), masterKey(), tenantId);
}

/**
 * Os índices de lead que podem ser o mesmo número da conversa: com e sem o 9,
 * porque o lead guarda o telefone como foi digitado.
 */
export function leadHashesForChat(raw: string, tenantId: string): string[] {
  const key = chatKey(raw);
  const m = /^55(\d{2})9([6-9]\d{7})$/.exec(key);
  const forms = m ? [key, `55${m[1]}${m[2]}`] : [key];
  return forms.map((f) => phoneHash(f, tenantId));
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
