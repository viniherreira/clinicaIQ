import { processCloudQueue } from './cloud-send';

/**
 * O relógio do CRM: o que precisa acontecer sem ninguém na tela. O gateway, que
 * fica sempre ligado, chama /api/cron/crm-tick a cada minuto (a Vercel no plano
 * Hobby só tem crons diários).
 *
 * Cada parte tem limite por rodada, para caber no tempo de uma função.
 */
export async function runTick(now: Date = new Date()) {
  const cloudSent = await processCloudQueue(now);
  return { cloudSent };
}
