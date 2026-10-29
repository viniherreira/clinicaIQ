import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Chaves numeradas, para a chave mestra poder ser trocada (achado F-16).
 *
 * Quem chama passa sempre a `ENCRYPTION_MASTER_KEY`, que é a chave ATUAL, de
 * número `ENCRYPTION_KEY_VERSION` (1 quando não definido). Durante uma troca,
 * as chaves anteriores ficam em `ENCRYPTION_MASTER_KEY_V<n>` até tudo ser
 * recifrado (docs/producao/rotacao-chave.md).
 *
 * Formato: texto sem prefixo é da chave 1 — tudo o que já estava gravado. Com a
 * chave 1 ativa, nada muda: o texto sai igual ao de sempre. A partir da 2, o
 * texto ganha `k<n>.` na frente (o ponto não existe em base64).
 */
const VERSION_PREFIX = /^k(\d+)\./;

export function currentKeyVersion(): number {
  const raw = process.env.ENCRYPTION_KEY_VERSION?.trim();
  if (!raw) return 1;
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`ENCRYPTION_KEY_VERSION inválida: use um número inteiro a partir de 1.`);
  }
  return version;
}

/** A chave de cada número: a atual é a que veio de quem chama. */
function keyFor(version: number, currentKey: string): string {
  if (version === currentKeyVersion()) return currentKey;
  const key = process.env[`ENCRYPTION_MASTER_KEY_V${version}`];
  if (!key) throw new Error(`ENCRYPTION_MASTER_KEY_V${version} not set: texto cifrado com a chave ${version}`);
  return key;
}

/** O número da chave que cifrou este texto. */
export function keyVersionOf(ciphertext: string): number {
  const m = VERSION_PREFIX.exec(ciphertext);
  return m ? Number(m[1]) : 1;
}

function deriveKey(masterKey: string, tenantId: string): Buffer {
  return Buffer.from(
    createHmac('sha256', masterKey).update(`odontoflow:${tenantId}`).digest(),
  );
}

export function encrypt(plaintext: string, masterKey: string, tenantId: string): string {
  const version = currentKeyVersion();
  const key = deriveKey(masterKey, tenantId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const body = Buffer.concat([iv, authTag, encrypted]).toString('base64');
  return version === 1 ? body : `k${version}.${body}`;
}

export function decrypt(ciphertext: string, masterKey: string, tenantId: string): string {
  const prefix = VERSION_PREFIX.exec(ciphertext);
  const version = prefix ? Number(prefix[1]) : 1;
  const key = deriveKey(keyFor(version, masterKey), tenantId);
  const data = Buffer.from(prefix ? ciphertext.slice(prefix[0].length) : ciphertext, 'base64');

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final('utf8');
}

function hmacForTenant(value: string, key: string, tenantId: string): string {
  return createHmac('sha256', key).update(`hash:${tenantId}:${value}`).digest('base64url');
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
 * Para gravar. Para procurar, use `hashesForTenant`.
 */
export function hashForTenant(value: string, masterKey: string, tenantId: string): string {
  return hmacForTenant(value, masterKey, tenantId);
}

/**
 * Os códigos para PROCURAR um valor: o da chave atual primeiro e, durante uma
 * troca, o de cada outra chave configurada — o registro pode não ter sido
 * recifrado ainda (ou, numa troca desfeita, já ter sido). Fora de uma troca, é um só.
 */
export function hashesForTenant(value: string, masterKey: string, tenantId: string): string[] {
  const current = currentKeyVersion();
  const others = Object.keys(process.env)
    .map((name) => /^ENCRYPTION_MASTER_KEY_V(\d+)$/.exec(name))
    .flatMap((m) => (m && Number(m[1]) !== current && process.env[m[0]] ? [Number(m[1])] : []))
    .sort((a, b) => b - a);
  return [
    hmacForTenant(value, masterKey, tenantId),
    ...others.map((v) => hmacForTenant(value, process.env[`ENCRYPTION_MASTER_KEY_V${v}`]!, tenantId)),
  ];
}
