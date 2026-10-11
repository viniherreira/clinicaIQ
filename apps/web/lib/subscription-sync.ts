import 'server-only';
import { prisma } from '@clinicaiq/db';
import { GRACE_DAYS, resolveAccess } from './subscription';
import { stopComplimentaryBilling } from './complimentary';
import { syncBillingValue } from '@/crm/addon';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReconcileResult {
  checked: number;
  changed: number;
  transitions: { tenantId: string; from: string; to: string }[];
}

/**
 * Alinha a coluna `status` das assinaturas com o que as datas dizem.
 *
 * Não é a fonte da verdade: `resolveAccess` recalcula a cada requisição, então
 * um dia sem rodar não solta acesso de graça nem bloqueia ninguém por engano. O
 * que isso compra é um `status` que bate com a realidade para quem lê a tabela
 * direto, e um lugar único para pendurar avisos de cobrança depois.
 */
export async function reconcileSubscriptions(now: Date = new Date()): Promise<ReconcileResult> {
  const subscriptions = await prisma.subscription.findMany({
    where: { status: { notIn: ['CANCELLED'] } },
    select: {
      id: true,
      tenantId: true,
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      graceEndsAt: true,
      cancelledAt: true,
      complimentary: true,
      asaasSubscriptionId: true,
    },
  });

  const transitions: ReconcileResult['transitions'] = [];

  for (const sub of subscriptions) {
    // Cortesia que ainda tem cobrança viva no Asaas: encerrar lá. Falha aqui
    // não pode derrubar a reconciliação das outras clínicas.
    if (sub.complimentary) {
      await stopComplimentaryBilling(sub).catch((e) =>
        console.error('[cortesia] falha ao encerrar cobrança', sub.tenantId, e),
      );
    }

    // Valor da mensalidade (plano + CRM): pega o fim do teste grátis do CRM e
    // qualquer divergência com o Asaas. Só manda quando o valor mudou.
    await syncBillingValue(sub.tenantId, undefined, now).catch((e) =>
      console.error('[crm] valor da assinatura não sincronizado', sub.tenantId, e instanceof Error ? e.message : e),
    );

    const access = resolveAccess(sub, now);
    if (access.status === sub.status) continue;

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: access.status,
        // Fixa a janela de tolerância na primeira vez que notamos o vencimento,
        // para ela não escorregar se a data do período for editada depois.
        ...(access.status === 'PAST_DUE' && !sub.graceEndsAt
          ? { graceEndsAt: new Date(sub.currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS) }
          : {}),
      },
    });
    transitions.push({ tenantId: sub.tenantId, from: sub.status, to: access.status });
  }

  return { checked: subscriptions.length, changed: transitions.length, transitions };
}
