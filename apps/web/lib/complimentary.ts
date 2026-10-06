import 'server-only';
import { prisma } from '@clinicaiq/db';
import { AsaasError, cancelSubscription, deletePayment, isConfigured } from './asaas';

/**
 * Desliga a cobrança de uma clínica em cortesia.
 *
 * Conceder a cortesia é só virar uma bandeira no banco — o acesso passa a valer
 * na hora, porque `resolveAccess` olha para ela antes de qualquer data. Mas o
 * Asaas não lê o nosso banco: a assinatura continua lá gerando boleto todo mês,
 * e as faturas já emitidas seguem mandando lembrete. Isto fecha as duas pontas.
 *
 * Roda de dois lugares — a tela de plano e a reconciliação diária —, então tem
 * que ser idempotente e falhar sem estrago: o que o Asaas recusar fica como
 * estava e é tentado de novo na próxima passada. Nunca marcamos aqui como
 * cancelado algo que continua vivo lá; uma tela dizendo "sem cobrança" enquanto
 * o boleto continua saindo é o pior defeito possível numa tela de cobrança.
 *
 * Devolve true quando alguma coisa mudou.
 */
export async function stopComplimentaryBilling(sub: {
  id: string;
  tenantId: string;
  asaasSubscriptionId: string | null;
}): Promise<boolean> {
  const abertas = await prisma.charge.findMany({
    where: { subscriptionId: sub.id, status: { in: ['PENDING', 'OVERDUE'] } },
    select: { id: true, asaasChargeId: true },
  });
  if (!sub.asaasSubscriptionId && abertas.length === 0) return false;

  // Sem a chave não há como falar com o Asaas. Cancelar só do nosso lado
  // esconderia uma cobrança que continua existindo — melhor esperar.
  const temAsaas = isConfigured();
  if (!temAsaas && (sub.asaasSubscriptionId || abertas.some((c) => c.asaasChargeId))) {
    return false;
  }

  // 404 = já não existe lá. Para quem quer a coisa apagada, é sucesso.
  const jaNaoExiste = (e: unknown) => e instanceof AsaasError && e.status === 404;

  let assinaturaEncerrada = !sub.asaasSubscriptionId;
  if (sub.asaasSubscriptionId) {
    try {
      await cancelSubscription(sub.asaasSubscriptionId);
      assinaturaEncerrada = true;
    } catch (e) {
      if (jaNaoExiste(e)) assinaturaEncerrada = true;
      else console.error('[cortesia] Asaas recusou encerrar a assinatura', e);
    }
  }

  const canceladas: string[] = [];
  for (const c of abertas) {
    if (!c.asaasChargeId) {
      canceladas.push(c.id);
      continue;
    }
    try {
      await deletePayment(c.asaasChargeId);
      canceladas.push(c.id);
    } catch (e) {
      if (jaNaoExiste(e)) canceladas.push(c.id);
      else console.error('[cortesia] Asaas recusou remover a cobrança', c.asaasChargeId, e);
    }
  }

  if (!assinaturaEncerrada && canceladas.length === 0) return false;

  await prisma.$transaction([
    ...(assinaturaEncerrada && sub.asaasSubscriptionId
      ? [
          prisma.subscription.update({
            where: { id: sub.id },
            data: { asaasSubscriptionId: null },
          }),
        ]
      : []),
    ...(canceladas.length > 0
      ? [
          prisma.charge.updateMany({
            where: { id: { in: canceladas } },
            data: { status: 'CANCELLED' },
          }),
        ]
      : []),
    prisma.auditLog.create({
      data: {
        tenantId: sub.tenantId,
        action: 'COMPLIMENTARY_BILLING_STOPPED',
        entity: 'Subscription',
        entityId: sub.id,
        metadata: { assinaturaEncerrada, cobrancasCanceladas: canceladas.length },
      },
    }),
  ]);

  return true;
}
