/**
 * Reads config from the environment. Values are trimmed and stripped of stray
 * surrounding quotes — pasting into a hosting dashboard often carries those in,
 * and a token with a trailing newline fails auth in a way that's hard to spot.
 */
function clean(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^["']|["']$/g, '');
}

const REQUIRED = ['DATABASE_URL', 'WHATSAPP_GATEWAY_TOKEN', 'ENCRYPTION_MASTER_KEY'] as const;

const missing = REQUIRED.filter((name) => !clean(process.env[name]));
if (missing.length > 0) {
  // Print the whole picture at once, so one restart tells the operator exactly
  // what to fix instead of revealing them one at a time.
  console.error(
    `[gateway] cannot start — missing env var(s): ${missing.join(', ')}\n` +
      `[gateway] set them in your host's Variables tab, then redeploy.`,
  );
  process.exit(1);
}

export const env = {
  PORT: Number(process.env.PORT ?? 8080),
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
