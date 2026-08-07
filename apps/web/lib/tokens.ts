import { randomBytes } from 'node:crypto';

/**
 * Tokens que funcionam como credencial — quem tem o link, tem o acesso.
 *
 * Prisma's `@default(cuid())` is the wrong tool here. A cuid is built to be a
 * collision-free identifier, not a secret: it carries a readable timestamp, a
 * sequential counter and a per-machine fingerprint, leaving only a short random
 * tail. The cuid author deprecated v1 precisely because people were using it
 * where unguessability mattered.
 *
 * 32 bytes from the OS CSPRNG, base64url so it survives a URL untouched.
 */
export function capabilityToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Reconhece um token no formato antigo (cuid v1), para migração. */
export function isLegacyCuidToken(token: string): boolean {
  return /^c[a-z0-9]{24}$/.test(token);
}
