'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, Check, KanbanSquare, Sparkles } from 'lucide-react';

/**
 * Os cartões de preço da página de vendas, com a chave "sem CRM / com CRM".
 * Os números vêm do banco (os mesmos da tela de planos); aqui só se escolhe
 * qual das duas versões mostrar.
 */

export interface PublicPlan {
  tier: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  maxProfessionals: number | null;
  campaignsEnabled: boolean;
  advancedReports: boolean;
  crmPackagePriceCents: number;
  crmIncludedSeats: number;
  crmSeatPriceCents: number;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const usuarios = (n: number) => `${n} ${n === 1 ? 'usuário' : 'usuários'}`;

function base(plan: PublicPlan): string[] {
  return [
    plan.maxProfessionals === null
      ? 'Profissionais ilimitados'
      : `${plan.maxProfessionals} ${plan.maxProfessionals > 1 ? 'profissionais' : 'profissional'}`,
    'Agenda, pacientes e prontuário com odontograma',
    'Orçamentos com link de aprovação e PDF',
    'WhatsApp oficial no número da clínica',
    'Confirmação e lembretes com botões',
    plan.campaignsEnabled ? 'Campanhas em massa' : null,
    plan.advancedReports ? 'Relatórios completos' : null,
  ].filter((f): f is string => f !== null);
}

function doCrm(plan: PublicPlan): string[] {
  return [
    `CRM para ${usuarios(plan.crmIncludedSeats)} (cada um a mais, ${brl(plan.crmSeatPriceCents)})`,
    'Funil de captação que anda com a agenda',
    'Conversas do WhatsApp com toda a equipe',
    'Robô de atendimento e transmissões',
  ];
}

export function PricingPlans({ plans }: { plans: PublicPlan[] }) {
  const temCrm = plans.some((p) => p.crmPackagePriceCents > 0);
  const [comCrm, setComCrm] = useState(false);

  return (
    <>
      {temCrm && (
        <fieldset className="mt-10 flex flex-col items-center gap-3">
          <legend className="sr-only">Mostrar os preços</legend>
          <div className="inline-flex rounded-full border border-border bg-background p-1 shadow-sm">
            {[
              { valor: false, rotulo: 'Gestão da clínica' },
              { valor: true, rotulo: 'Gestão + CRM' },
            ].map((o) => (
              <label
                key={o.rotulo}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring sm:px-5 ${
                  comCrm === o.valor ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="precos-crm"
                  checked={comCrm === o.valor}
                  onChange={() => setComCrm(o.valor)}
                  className="sr-only"
                />
                {o.rotulo}
              </label>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {comCrm
              ? 'O CRM organiza quem ainda não virou paciente: do primeiro "oi" no WhatsApp ao orçamento aprovado.'
              : 'Tudo para a rotina da clínica. Dá para ligar o CRM depois, a qualquer momento.'}
          </p>
        </fieldset>
      )}

      <ul className="mt-10 grid items-start gap-6 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const featured = index === 1;
          const crm = comCrm && plan.crmPackagePriceCents > 0;
          const preco = plan.monthlyPriceCents + (crm ? plan.crmPackagePriceCents : 0);
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

                <h3 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight">
                  {plan.name}
                  {crm && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      <KanbanSquare className="h-3 w-3" aria-hidden="true" /> + CRM
                    </span>
                  )}
                </h3>
                <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-muted-foreground">{plan.description}</p>

                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight tabular-nums">{brl(preco)}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </p>
                <p className="mt-1 min-h-[1.25rem] text-xs text-muted-foreground">
                  {crm
                    ? `${brl(plan.monthlyPriceCents)} do plano + ${brl(plan.crmPackagePriceCents)} do CRM`
                    : plan.crmPackagePriceCents > 0
                      ? `Com CRM: ${brl(plan.monthlyPriceCents + plan.crmPackagePriceCents)}/mês`
                      : ''}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {base(plan).map((f) => (
                    <li key={f} className="flex gap-3 text-sm">
                      {f.startsWith('WhatsApp oficial') ? (
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      ) : (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      )}
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                  {crm &&
                    doCrm(plan).map((f) => (
                      <li key={f} className="flex gap-3 text-sm">
                        <KanbanSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
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
    </>
  );
}
