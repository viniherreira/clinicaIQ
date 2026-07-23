import { PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto';

/**
 * The gateway is a standalone Node service, so it talks to Postgres with its own
 * client rather than importing the app's TypeScript-source `@clinicaiq/db`
 * package (which only resolves inside a bundler).
 *
 * It reads and writes only `whatsapp_sessions` and `whatsapp_auth_keys`, always
 * scoped by tenantId — it never touches patient data.
 */
export const prisma = new PrismaClient({ log: ['error'] });

// ─── Encryption ──────────────────────────────────────────────────────────────
// Mirrors packages/db/src/encryption.ts — the wire format must stay identical
// so both sides can read each other's ciphertext. Change them together.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function deriveKey(masterKey: string, tenantId: string): Buffer {
  return Buffer.from(createHmac('sha256', masterKey).update(`odontoflow:${tenantId}`).digest());
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

export type WhatsAppConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'QR_PENDING'
  | 'CONNECTED'
  | 'ERROR';
