/**
 * O mínimo para mandar um erro ao Sentry, sem o SDK: ler o DSN e montar o
 * "envelope" que a API de ingestão recebe. Puro e testado; quem envia é
 * `lib/observability.ts`.
 *
 * Só vai o tipo, a mensagem e a pilha do erro, mais o contexto que quem chama
 * passar. Nada de corpo de requisição, cookie ou endereço completo: os dados
 * são de pacientes (LGPD).
 */

export interface SentryTarget {
  /** Endereço do envelope, já com a chave pública na query. */
  url: string;
}

/** `https://<chave>@<host>/<projeto>` → endereço do envelope, ou null se o DSN não serve. */
export function parseDsn(dsn: string | undefined | null): SentryTarget | null {
  if (!dsn) return null;
  let u: URL;
  try {
    u = new URL(dsn.trim());
  } catch {
    return null;
  }
  const key = u.username;
  const parts = u.pathname.split('/').filter(Boolean);
  const projectId = parts.pop();
  if (!key || !projectId || !/^\d+$/.test(projectId) || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
  const prefix = parts.length ? `/${parts.join('/')}` : '';
  return { url: `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7` };
}

export interface ErrorEventInput {
  error: unknown;
  /** Identificador de 32 caracteres hexadecimais. */
  eventId: string;
  now: Date;
  environment: string;
  /** Rótulos curtos para filtrar no Sentry (rota, método, origem). */
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

const MAX_TEXT = 4000;
const cut = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

/** Tipo e mensagem de qualquer coisa que tenha sido lançada. */
export function describeError(error: unknown): { type: string; value: string; stack?: string } {
  if (error instanceof Error) {
    return { type: error.name || 'Error', value: cut(error.message || '(sem mensagem)'), stack: error.stack ? cut(error.stack) : undefined };
  }
  if (typeof error === 'string') return { type: 'Error', value: cut(error) };
  try {
    return { type: 'Error', value: cut(JSON.stringify(error)) };
  } catch {
    return { type: 'Error', value: String(error) };
  }
}

/** Monta o envelope (três linhas JSON) de um evento de erro. */
export function buildEnvelope(input: ErrorEventInput): string {
  const { type, value, stack } = describeError(input.error);
  const event = {
    event_id: input.eventId,
    timestamp: input.now.getTime() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: input.environment,
    exception: { values: [{ type, value }] },
    tags: input.tags ?? {},
    extra: { ...(input.extra ?? {}), ...(stack ? { stack } : {}) },
  };
  return [
    JSON.stringify({ event_id: input.eventId, sent_at: input.now.toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
}
