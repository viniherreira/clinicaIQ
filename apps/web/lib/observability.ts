import { buildEnvelope, parseDsn } from './sentry-envelope';

/**
 * Central error reporter. Logs to the server/browser console (on Vercel that
 * lands in the function logs) and, with `NEXT_PUBLIC_SENTRY_DSN` set, also sends
 * the error to Sentry, so somebody gets an alert instead of finding out when a
 * clinic complains. Without the variable it only logs, as before.
 *
 * Who calls it: the error boundaries (`app/error.tsx`, `app/global-error.tsx`)
 * and `onRequestError` in `instrumentation.ts`, which catches what breaks in
 * server actions, pages and API routes.
 *
 * Safe to call from client or server, and it never throws.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  console.error('[clinicaiq]', error, context ?? '');
  void sendToSentry(error, context).catch(() => undefined);
}

const target = parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);

function eventId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendToSentry(error: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!target) return;
  // Só rótulos curtos viram tag; o resto vai como contexto do evento.
  const tags: Record<string, string> = { origem: typeof window === 'undefined' ? 'servidor' : 'navegador' };
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context ?? {})) {
    if (typeof v === 'string' && v.length <= 200) tags[k] = v;
    else extra[k] = v;
  }
  await fetch(target.url, {
    method: 'POST',
    body: buildEnvelope({
      error,
      eventId: eventId(),
      now: new Date(),
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
      tags,
      extra,
    }),
    // No navegador, o envio sobrevive à troca de página.
    keepalive: true,
  });
}
