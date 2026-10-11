import { prisma } from '@clinicaiq/db';
import { gatewayConfigured } from '@clinicaiq/whatsapp';

/**
 * Só em desenvolvimento, sem gateway: dá como enviadas as mensagens do CRM que
 * chegaram na hora (transmissões, robô, automações), para a fila andar na tela
 * como andaria em produção. Nunca roda em produção.
 */
export async function simulateDueLocal(now: Date = new Date()): Promise<number> {
  if (process.env.NODE_ENV === 'production' || gatewayConfigured()) return 0;
  const { count } = await prisma.chatMessage.updateMany({
    where: {
      direction: 'OUTBOUND',
      origin: { in: ['CRM', 'BROADCAST', 'BOT'] },
      status: 'PENDING',
      acceptedAt: null,
      at: { lte: now },
      tenant: { OR: [{ whatsappCloudAccount: { is: null } }, { whatsappCloudAccount: { is: { active: false } } }] },
    },
    data: { status: 'SENT', acceptedAt: now, attempts: 1 },
  });
  return count;
}
