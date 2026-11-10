import { prisma } from '@clinicaiq/db';
import { NO_CHANNEL_MESSAGE } from './conversations';

/** Clínica sem a API oficial ligada (nunca conectou, ou desligou). */
const SEM_CANAL = { OR: [{ whatsappCloudAccount: { is: null } }, { whatsappCloudAccount: { is: { active: false } } }] };

/**
 * As mensagens do CRM que chegaram na hora (transmissões, robô, automações) numa
 * clínica sem a API oficial, onde ninguém vai mandá-las.
 *
 * - Produção: viram "não enviada", com o motivo, em vez de ficar no relógio
 *   para sempre. Espera um minuto além da hora, para não pegar quem acabou de
 *   conectar.
 * - Desenvolvimento e testes: são dadas como enviadas, para a fila andar na tela.
 */
export async function settleWithoutChannel(now: Date = new Date()): Promise<number> {
  const producao = process.env.NODE_ENV === 'production';
  const { count } = await prisma.chatMessage.updateMany({
    where: {
      direction: 'OUTBOUND',
      origin: { in: ['CRM', 'BROADCAST', 'BOT'] },
      status: 'PENDING',
      acceptedAt: null,
      at: { lte: producao ? new Date(now.getTime() - 60_000) : now },
      tenant: SEM_CANAL,
    },
    data: producao
      ? { status: 'FAILED', errorMessage: NO_CHANNEL_MESSAGE, nextAttemptAt: null, claimedUntil: null }
      : { status: 'SENT', acceptedAt: now, attempts: 1 },
  });
  return count;
}
