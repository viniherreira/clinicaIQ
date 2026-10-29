import { prisma } from '@clinicaiq/db';

/**
 * Limite de tentativas das rotas públicas (agendamento online, orçamento,
 * webhook antigo), com janela fixa.
 *
 * O contador fica no Postgres (`rate_limits`). Antes ficava num `Map` do
 * processo, que só serve com uma instância: na Vercel cada função roda em
 * várias, que nascem e morrem, e "5 por minuto" virava 5 por minuto *por
 * instância* — na prática, sem limite.
 *
 * Um `INSERT … ON CONFLICT` por chamada: atômico, sem corrida entre instâncias.
 * Se o banco falhar (ou a tabela ainda não existir num deploy recém-feito), cai
 * para o contador da memória: limita menos, mas não derruba a página.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

function resultado(count: number, resetAt: number, limit: number, now: number): RateLimitResult {
  if (count > limit) return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  return { ok: true, remaining: limit - count, retryAfter: 0 };
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  try {
    const agora = BigInt(now);
    const fim = BigInt(now + windowMs);
    const [linha] = await prisma.$queryRaw<{ count: number; resetAt: bigint }[]>`
      INSERT INTO "rate_limits" ("key", "count", "resetAt") VALUES (${key}, 1, ${fim})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "rate_limits"."resetAt" <= ${agora} THEN 1 ELSE "rate_limits"."count" + 1 END,
        "resetAt" = CASE WHEN "rate_limits"."resetAt" <= ${agora} THEN EXCLUDED."resetAt" ELSE "rate_limits"."resetAt" END
      RETURNING "count", "resetAt"`;
    // Faxina de vez em quando: janelas vencidas há mais de um dia.
    if (Math.random() < 0.01) {
      void prisma.rateLimit.deleteMany({ where: { resetAt: { lt: BigInt(now - 86_400_000) } } }).catch(() => undefined);
    }
    return resultado(Number(linha.count), Number(linha.resetAt), limit, now);
  } catch (error) {
    console.warn('[rate-limit] banco indisponível, usando a memória', error instanceof Error ? error.message : error);
    return memoryRateLimit(key, limit, windowMs, now);
  }
}

// ─── Reserva na memória (só quando o banco falha) ─────────────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
  if (buckets.size >= 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return resultado(1, now + windowMs, limit, now);
  }
  bucket.count += 1;
  return resultado(bucket.count, bucket.resetAt, limit, now);
}

/** Best-effort client IP from standard proxy headers. Accepts both the fetch
 *  `Headers` and Next's read-only `headers()` result. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
