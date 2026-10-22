/**
 * Public pricing, on the landing page.
 *
 * Reads the same `plans` rows the billing screen uses, so a price change is one
 * update and never leaves the shop window disagreeing with the checkout — the
 * kind of mismatch that costs trust exactly when someone is deciding to pay.
 * Each plan shows with and without the CRM (`pricing-plans.tsx` holds the switch).
 */
import { BadgeCheck } from 'lucide-react';
import { prisma } from '@clinicaiq/db';
import { TRIAL_DAYS } from '@/lib/subscription';
import { PricingPlans, type PublicPlan } from './pricing-plans';

export async function Pricing() {
  let plans: PublicPlan[] = [];
  try {
    plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        tier: true,
        name: true,
        description: true,
        monthlyPriceCents: true,
        maxProfessionals: true,
        campaignsEnabled: true,
        advancedReports: true,
        crmPackagePriceCents: true,
        crmIncludedSeats: true,
        crmSeatPriceCents: true,
      },
    });
  } catch {
    // The marketing page must survive a database hiccup: a visitor seeing the
    // rest of the site beats a 500 for everyone because pricing could not load.
    return null;
  }

  if (plans.length === 0) return null;

  return (
    <section id="planos" className="scroll-mt-20 border-y border-border bg-surface py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Planos</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Um preço que acompanha o tamanho da sua clínica
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Comece grátis por {TRIAL_DAYS} dias, sem cartão. Depois, escolha o plano, com ou sem o CRM,
            pague por PIX, boleto ou cartão e cancele quando quiser.
          </p>
        </div>

        <PricingPlans plans={plans} />

        <div className="mx-auto mt-10 flex max-w-3xl items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-emerald-950 dark:text-emerald-100">
            <strong>Todos os planos usam a API oficial do WhatsApp, da Meta.</strong> As mensagens saem do número
            da sua clínica, sem QR code e sem celular ligado o dia todo. As conversas com o WhatsApp são cobradas
            pela Meta direto da clínica, conforme a tabela dela.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Todos os planos incluem acessibilidade WCAG 2.1 AA, backup diário e suporte por WhatsApp.
          Sem fidelidade e sem taxa de instalação.
        </p>
      </div>
    </section>
  );
}
