import { Queue } from 'bullmq';

/**
 * Connection for BullMQ.
 *
 * Built from the whole URL, not just host and port: a managed Redis (Railway,
 * Upstash) puts credentials in the userinfo and may require TLS, and dropping
 * them meant every connection was refused with NOAUTH. Since the only caller
 * wraps its enqueue in a `catch {}`, that failed silently — the 24h reminder was
 * never scheduled and nothing said so.
 */
function buildRedisConnection() {
  const raw = process.env.REDIS_URL;
  if (!raw) return { host: 'localhost', port: 6379 };

  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export const redisConnection = buildRedisConnection();

export const APPOINTMENT_QUEUE = 'appointments';

export const appointmentQueue = new Queue(APPOINTMENT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
});

/** Jobs that need scheduling/retries. Immediate sends are dispatched inline by
 *  the server action (see lib/whatsapp.ts), so only the delayed reminder rides
 *  the queue. */
export type AppointmentJobData = {
  type: 'whatsapp-reminder-24h';
  appointmentId: string;
  tenantId: string;
};
