import Link from 'next/link';
import { ArrowRight, CreditCard } from 'lucide-react';
import { prisma } from '@clinicaiq/db';
import { NO_SUBSCRIPTION, resolveAccess } from '@/lib/subscription';

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Entry point to billing, from Settings — where a clinic looks for anything
 * about its own account rather than its patients.
 *
 * Shows the state inline so the common question ("estou em dia?") is answered
 * without a click.
 */
export async function BillingCard({ tenantId }: { tenantId: string }) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    select: {
      tier: true,
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      graceEndsAt: true,
      cancelledAt: true,
      plan: { select: { name: true, monthlyPriceCents: true } },
    },
  });

  const access = subscription ? resolveAccess(subscription, new Date()) : NO_SUBSCRIPTION;
  const blocked = access.level === 'readonly';

  return (
    <section
      aria-labelledby="cobranca-title"
      className={`rounded-2xl border bg-surface p-6 ${blocked ? 'border-destructive/40' : 'border-border'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              blocked
                ? 'bg-destructive/10 text-destructive'
                : access.warning
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            }`}
          >
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="cobranca-title" className="font-semibold">
              Plano e cobrança
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {subscription?.plan
                ? `${subscription.plan.name} · ${brl(subscription.plan.monthlyPriceCents)}/mês`
                : 'Nenhum plano ativo.'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {access.warning ??
                `Em dia até ${subscription?.currentPeriodEnd.toLocaleDateString('pt-BR')}.`}
            </p>
          </div>
        </div>

        <Link href="/planos" className={`${blocked ? 'btn-primary' : 'btn-outline'} btn-md shrink-0`}>
          {blocked ? 'Regularizar' : 'Gerenciar plano'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
