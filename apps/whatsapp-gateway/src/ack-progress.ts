/**
 * Quão longe uma mensagem chegou, e se um ack novo vale a pena gravar.
 *
 * Vive num módulo próprio porque é a regra inteira de um bug que custou semanas
 * para achar, e um módulo sem Baileys nem Prisma é um módulo que dá para testar.
 */

/** Estados nossos, do menos para o mais adiantado. */
export const PROGRESS: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

/**
 * WhatsApp's own delivery states (proto.WebMessageInfo.Status) mapped to ours.
 * PENDING (1) is skipped: it's the pre-send state we already record ourselves.
 */
export const ACK_TO_STATUS: Record<number, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  0: 'FAILED', // ERROR
  2: 'SENT', // SERVER_ACK — WhatsApp's servers have it
  3: 'DELIVERED', // DELIVERY_ACK — reached the phone
  4: 'READ',
  5: 'READ', // PLAYED
};

/**
 * Vale gravar este ack sobre o estado atual da linha?
 *
 * Só para frente, nunca para trás. Acks chegam fora de ordem, e o Baileys
 * reemite `messages.update` ao reconectar com o estado que tinha guardado —
 * então um SERVER_ACK antigo chegava depois do READ e arrastava a linha de volta
 * para "Saindo…". A tela da clínica passava a mentir sobre uma mensagem que o
 * paciente já tinha lido, e a varredura de presas não resgatava: ela exige
 * `deliveredAt` nulo, e essa coluna já estava preenchida.
 */
export function ackAdvances(atual: string, novo: string): boolean {
  const jaEntregue = (PROGRESS[atual] ?? 0) >= PROGRESS.DELIVERED;
  // Uma recusa que chega depois da entrega confirmada é resíduo, não notícia:
  // a mensagem chegou ao aparelho.
  if (novo === 'FAILED') return !jaEntregue;
  return (PROGRESS[novo] ?? 0) > (PROGRESS[atual] ?? 0);
}
