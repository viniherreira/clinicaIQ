/**
 * BullMQ worker for scheduled WhatsApp jobs.
 *
 * Run separately from the Next.js app:
 *   pnpm worker            (from repo root — loads ../../.env)
 *
 * Only the delayed 24h confirmation reminder rides the queue; immediate
 * "created" messages are dispatched inline by the server action. Requires Redis
 * (see docker-compose.yml). In dev without Redis this process simply won't start
 * a connection — the app keeps working, reminders just don't fire.
 *
 * Imports are relative (not the `@/` alias) so the file runs under tsx outside
 * Next's module resolver.
 */
import { Worker } from 'bullmq';
import { APPOINTMENT_QUEUE, redisConnection, type AppointmentJobData } from './lib/queue';
import { dispatchAppointmentMessage } from './lib/whatsapp';

const worker = new Worker<AppointmentJobData>(
  APPOINTMENT_QUEUE,
  async (job) => {
    if (job.data.type === 'whatsapp-reminder-24h') {
      const result = await dispatchAppointmentMessage(job.data.appointmentId, 'reminder');
      if (!result.success) {
        throw new Error(`reminder dispatch failed: ${result.error ?? 'unknown'}`);
      }
    }
  },
  { connection: redisConnection, concurrency: 5 },
);

worker.on('completed', (job) => {
  console.log(`[worker] job ${job.id} (${job.name}) completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} (${job?.name}) failed:`, err.message);
});

console.log(`[worker] listening on queue "${APPOINTMENT_QUEUE}"`);

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
