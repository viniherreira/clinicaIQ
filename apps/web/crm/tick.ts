import { expireBots, startNoReplyBots, wakeBots } from './bot';
import { finishBroadcasts, startDueBroadcasts } from './broadcasts';
import { processCloudQueue } from './cloud-send';
import { settleWithoutChannel } from './no-channel';
import { runDueAutomations } from './stage-automations';
import { fillMissingCpfHashes } from '@/lib/cpf-hash';
import { reencryptWithCurrentKey } from '@/lib/key-rotation';

/**
 * O relógio do CRM: o que precisa acontecer sem ninguém na tela. O pg_cron do
 * Supabase chama /api/cron/crm-tick a cada minuto (a Vercel no plano Hobby só
 * tem crons diários).
 *
 * Cada parte tem limite por rodada, para caber no tempo de uma função.
 */
export async function runTick(now: Date = new Date()) {
  const automations = await runDueAutomations(now);
  const broadcastsStarted = await startDueBroadcasts(now);
  const cloudSent = await processCloudQueue(now);
  const withoutChannel = await settleWithoutChannel(now);
  const broadcastsDone = await finishBroadcasts(now);
  // Robôs com hora marcada ("sem resposta", pausa) antes de expirar os parados.
  const botsWoken = await wakeBots(now);
  const botsNoReply = await startNoReplyBots(now);
  const botsExpired = await expireBots(now);
  // Manutenção: índice cego do CPF dos pacientes antigos (F-15). Zera sozinho.
  const cpfHashes = await fillMissingCpfHashes();
  // Troca da chave mestra (F-16): parada enquanto a chave atual é a 1.
  const keyRotation = await reencryptWithCurrentKey();
  return { automations, broadcastsStarted, cloudSent, withoutChannel, broadcastsDone, botsWoken, botsNoReply, botsExpired, cpfHashes, keyRotation };
}
