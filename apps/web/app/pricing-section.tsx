/**
 * Public pricing, on the landing page.
 *
 * Reads the same `plans` rows the billing screen uses, so a price change is one
 * update and never leaves the shop window disagreeing with the checkout — the
 * kind of mismatch that costs trust exactly when someone is deciding to pay.
 */
import Link from 'next/link';
import { Bricolage_Grotesque } from 'next/font/google';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { prisma } from '@clinicaiq/db';

const display = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap' });

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface PlanRow {
  tier: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  maxProfessionals: number | null;
  whatsappEnabled: boolean;
  campaignsEnabled: boolean;
  assistantEnabled: boolean;
  advancedReports: boolean;
}

function features(plan: PlanRow): string[] {
  return [
    plan.maxProfessionals === null
      ? 'Profissionais ilimitados'
      : `${plan.maxProfessionals} profissional${plan.maxProfessionals > 1 ? 'is' : ''}`,
    'Agenda, pacientes e prontuário',
    'Orçamentos em PDF',
    plan.whatsappEnabled ? 'Confirmação por WhatsApp' : null,
    plan.campaignsEnabled ? 'Campanhas em massa' : null,
    plan.advancedReports ? 'Relatórios completos' : null,
  ].filter((f): f is string => f !== null);
}

export async function Pricing() {
  let plans: PlanRow[] = [];
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
        whatsappEnabled: true,
        campaignsEnabled: true,
        assistantEnabled: true,
        advancedReports: true,
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
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Planos</p>
          <h2 className={`${display.className} mt-2 text-3xl font-bold tracking-tight sm:text-4xl`}>
            Um preço que acompanha o tamanho da sua clínica
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Comece grátis por 30 dias, sem cartão. Depois escolha o plano que fizer sentido — paga
            por PIX, boleto ou cartão, e cancela quando quiser.
          </p>
        </div>

        <ul className="mt-12 grid items-start gap-6 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const featured = index === 1;
            return (
              <li key={plan.tier} className={featured ? 'lg:-mt-4' : undefined}>
                <article
                  className={`relative flex h-full flex-col rounded-2xl border bg-background p-7 ${
                    featured ? 'border-primary/50 shadow-lg' : 'border-border'
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      <Sparkles className="h-3 w-3" aria-hidden="true" /> Mais escolhido
                    </span>
                  )}

                  <h3 className={`${display.className} mt-1 text-xl font-bold tracking-tight`}>
                    {plan.name}
                  </h3>
                  <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-muted-foreground">
                    {plan.description}
                  </p>

                  <p className="mt-6 flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold tracking-tight tabular-nums">
                      {brl(plan.monthlyPriceCents)}
                    </span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </p>

                  <ul className="mt-7 flex-1 space-y-3">
                    {features(plan).map((f) => (
                      <li key={f} className="flex gap-3 text-sm">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        <span className="leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/sign-up"
                    className={`${featured ? 'btn-primary' : 'btn-outline'} btn-md mt-8 w-full justify-center`}
                  >
                    Começar grátis
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Todos os planos incluem acessibilidade WCAG 2.1 AA, backup diário e suporte por WhatsApp.
          Sem fidelidade e sem taxa de instalação.
        </p>
      </div>
    </section>
  );
}
