/**
 * Central error reporter. Today it logs to the server/browser console (which on
 * Vercel is captured in the function logs, giving you a basic error trail). It
 * is the single hook to wire a monitoring service (e.g. Sentry) into later —
 * add the SDK and forward from here, and every error boundary already reports
 * through this function.
 *
 * Safe to call from client or server.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  console.error('[clinicaiq]', error, context ?? '');
}
