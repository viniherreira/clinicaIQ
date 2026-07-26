/**
 * Reads config from the environment. Values are trimmed and stripped of stray
 * surrounding quotes — pasting into a hosting dashboard often carries those in,
 * and a token with a trailing newline fails auth in a way that's hard to spot.
 */
function clean(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^["']|["']$/g, '');
}

const REQUIRED = ['DATABASE_URL', 'WHATSAPP_GATEWAY_TOKEN', 'ENCRYPTION_MASTER_KEY'] as const;

/**
 * Config vars that are absent or blank. The process deliberately still boots
 * with these missing: exiting would crash-loop the container, and a container
 * that never stays up can't tell anyone *why*. Instead we serve /health, which
 * reports the list — turning the public URL into the diagnostic.
 */
export const envProblems: string[] = REQUIRED.filter((name) => !clean(process.env[name]));

/**
 * A PORT pasted with quotes or a stray space becomes NaN, and Node then binds to
 * a random port — the host routes to the expected port and every request 502s.
 * Fall back to 8080 rather than listening somewhere nobody is looking.
 */
function readPort(): number {
  const raw = clean(process.env.PORT);
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) return parsed;
  if (raw) console.warn(`[gateway] PORT inválida (${JSON.stringify(raw)}); usando 8080.`);
  return 8080;
}

export const env = {
  PORT: readPort(),
  /** Shared secret the Next.js app sends as `Authorization: Bearer …`. */
  GATEWAY_TOKEN: clean(process.env.WHATSAPP_GATEWAY_TOKEN),
  ENCRYPTION_MASTER_KEY: clean(process.env.ENCRYPTION_MASTER_KEY),
  /** How long a pairing QR stays valid before the clinic must ask for a new one. */
  QR_TTL_MS: Number(process.env.WHATSAPP_QR_TTL_MS ?? 60_000),
  /**
   * Base URL of the Next.js app. The gateway forwards patients' replies here so
   * the app can update the appointment. Optional — without it, messages still go
   * out, but replies won't auto-confirm.
   */
  APP_URL: clean(process.env.APP_URL).replace(/\/+$/, ''),
};

/** Startup banner. Secrets are reported as present/length only, never printed. */
export function logEnvSummary(): void {
  const mask = (v: string) => (v ? `ok (${v.length} chars)` : 'MISSING');
  console.log('[gateway] config:');
  console.log(`  PORT                    ${env.PORT}`);
  console.log(`  DATABASE_URL            ${clean(process.env.DATABASE_URL) ? 'ok' : 'MISSING'}`);
  console.log(`  ENCRYPTION_MASTER_KEY   ${mask(env.ENCRYPTION_MASTER_KEY)}`);
  console.log(`  WHATSAPP_GATEWAY_TOKEN  ${mask(env.GATEWAY_TOKEN)}`);
  console.log(`  APP_URL                 ${env.APP_URL || 'MISSING (respostas nao atualizam a agenda)'}`);
}
