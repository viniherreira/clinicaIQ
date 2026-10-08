import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveKey(masterKey: string, tenantId: string): Buffer {
  return Buffer.from(
    createHmac('sha256', masterKey).update(`odontoflow:${tenantId}`).digest(),
  );
}

export function encrypt(plaintext: string, masterKey: string, tenantId: string): string {
  const key = deriveKey(masterKey, tenantId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(ciphertext: string, masterKey: string, tenantId: string): string {
  const key = deriveKey(masterKey, tenantId);
  const data = Buffer.from(ciphertext, 'base64');

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Índice cego: um código fixo para um valor, que permite achar registros
 * iguais sem decifrar a tabela inteira — e sem guardar o valor em claro.
 *
 * Mesma chave mestra, outro domínio (`hash:` em vez do usado para cifrar):
 * nada do que sai daqui serve para decifrar coisa alguma. É por clínica, então
 * o mesmo telefone em duas clínicas dá dois códigos diferentes.
 *
 * Normalize antes de chamar (ex.: só dígitos): o código é do texto exato.
 */
export function hashForTenant(value: string, masterKey: string, tenantId: string): string {
  return createHmac('sha256', masterKey).update(`hash:${tenantId}:${value}`).digest('base64url');
}
