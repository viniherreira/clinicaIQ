import { Queue } from 'bullmq';

export const redisConnection = {
  host: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : 'localhost',
  port: process.env.REDIS_URL ? Number(new URL(process.env.REDIS_URL).port) || 6379 : 6379,
};

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
