import Link from 'next/link';
import { prisma } from '@clinicaiq/db';
import { currentAccess } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { CRM_TRIAL_WARNING_DAYS, trialDaysLeft } from '@/crm/billing';

/**
 * Aviso de fim do teste grátis, nos últimos dias, para quem cuida do plano.
 * Some sozinho fora do teste. Nunca derruba a tela: erro aqui vira nada.
 */
export async function CrmTrialBanner() {
  try {
    const acesso = await currentAccess();
    if (!acesso || !can(acesso.role, 'planos')) return null;
    const sub = await prisma.subscription.findUnique({
      where: { tenantId: acesso.tenantId },
      select: { crmEnabled: true, crmTrialEndsAt: true, complimentary: true },
    });
    const dias = trialDaysLeft(sub);
    if (dias === null || dias > CRM_TRIAL_WARNING_DAYS) return null;

    return (
      <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100 sm:px-6">
        O teste grátis do CRM termina {dias <= 1 ? 'amanhã' : `em ${dias} dias`}. Depois, a cobrança por usuário entra na mensalidade.{' '}
        <Link href="/configuracoes#plano" className="font-medium underline underline-offset-2">Ver o plano</Link>
      </div>
    );
  } catch {
    return null;
  }
}
