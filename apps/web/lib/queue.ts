import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : 'localhost',
  port: process.env.REDIS_URL ? Number(new URL(process.env.REDIS_URL).port) || 6379 : 6379,
};

export const appointmentQueue = new Queue('appointments', {
  connection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
});

export type AppointmentJobData =
  | { type: 'whatsapp-immediate'; appointmentId: string; tenantId: string }
  | { type: 'whatsapp-reminder-24h'; appointmentId: string; tenantId: string };
