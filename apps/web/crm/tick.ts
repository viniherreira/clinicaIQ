import { finishBroadcasts, startDueBroadcasts } from './broadcasts';
import { processCloudQueue } from './cloud-send';
import { simulateDueLocal } from './dev-clock';
import { runDueAutomations } from './stage-automations';

/**
 * O relógio do CRM: o que precisa acontecer sem ninguém na tela. O gateway, que
 * fica sempre ligado, chama /api/cron/crm-tick a cada minuto (a Vercel no plano
 * Hobby só tem crons diários).
 *
 * Cada parte tem limite por rodada, para caber no tempo de uma função.
 */
export async function runTick(now: Date = new Date()) {
  const automations = await runDueAutomations(now);
  const broadcastsStarted = await startDueBroadcasts(now);
  const cloudSent = await processCloudQueue(now);
  const simulated = await simulateDueLocal(now);
  const broadcastsDone = await finishBroadcasts(now);
  return { automations, broadcastsStarted, cloudSent, simulated, broadcastsDone };
}
