'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { completeOnboarding } from '../actions';
import { LogoMark } from '@/components/logo';
import {
  productAvailable,
  productPriceCents,
  PRODUCT_INFO,
  PRODUCTS,
  type PlanPrices,
  type Product,
  type Tier,
} from '@/lib/products';

export interface TrialPlan extends PlanPrices {
  tier: Tier;
  name: string;
  maxProfessionals: number | null;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** O tamanho em uma linha, do jeito que cada produto conta: profissionais na agenda, usuários no CRM. */
function tamanho(plan: TrialPlan, product: Product): string {
  const profs = plan.maxProfessionals === null ? 'profissionais ilimitados' : plan.maxProfessionals === 1 ? '1 profissional' : `até ${plan.maxProfessionals} profissionais`;
  const users = `${plan.crmIncludedSeats} ${plan.crmIncludedSeats === 1 ? 'usuário' : 'usuários'} no CRM`;
  return product === 'AGENDA' ? profs : product === 'CRM' ? users : `${profs} · ${users}`;
}

export function CreateClinicForm({ plans, initial }: { plans: TrialPlan[]; initial: { product: Product; tier: Tier } }) {
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product>(initial.product);
  const [tier, setTier] = useState<Tier>(initial.tier);

  const plano = plans.find((p) => p.tier === tier);
  const disponiveis = PRODUCTS.filter((p) => !plano || productAvailable(plano, p));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await completeOnboarding(null, formData);
        if (result.success) {
          // Direto para o sistema, já no teste grátis do plano escolhido.
          window.location.href = result.home;
        } else {
          setFieldErrors(result.errors);
        }
      } catch (err) {
        console.error('Onboarding error:', err);
        setServerError('Ocorreu um erro inesperado. Tente novamente.');
      }
    });
  }

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-fit">
            <LogoMark size="lg" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Configure sua clínica</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Leva um minuto. Você começa com 14 dias grátis, sem cartão, e ajusta tudo depois em Configurações.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 rounded-xl border bg-surface p-6 shadow-sm sm:p-8">
          <fieldset className="space-y-5">
            <legend className="text-base font-semibold">Sua clínica</legend>
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-medium">
                Nome da clínica <span aria-hidden="true" className="text-destructive">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoFocus
                placeholder="Ex: Clínica Odonto Silva"
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                className={inputCls}
              />
              {fieldErrors.name && (
                <p id="name-error" role="alert" className="text-xs text-destructive">
                  {fieldErrors.name[0]}
                </p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="document" className="block text-sm font-medium">
                  CNPJ <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="document"
                  name="document"
                  type="text"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  aria-describedby={fieldErrors.document ? 'document-error' : undefined}
                  className={inputCls}
                />
                {fieldErrors.document && (
                  <p id="document-error" role="alert" className="text-xs text-destructive">
                    {fieldErrors.document[0]}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="phone" className="block text-sm font-medium">
                  Telefone / WhatsApp <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input id="phone" name="phone" type="tel" inputMode="tel" placeholder="(11) 99999-9999" className={inputCls} />
              </div>
            </div>
          </fieldset>

          {plans.length > 0 && (
            <div className="space-y-5 border-t border-border pt-6">
              <fieldset>
                <legend className="text-base font-semibold">O que você quer testar?</legend>
                <p className="mt-1 text-sm text-muted-foreground">Dá para trocar a qualquer momento, durante o teste ou depois.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {disponiveis.map((p) => {
                    const on = product === p;
                    return (
                      <label
                        key={p}
                        className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${
                          on ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <input type="radio" name="product" value={p} checked={on} onChange={() => setProduct(p)} className="sr-only" />
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{PRODUCT_INFO[p].name}</span>
                          {on && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                        </span>
                        {p === 'COMPLETO' && (
                          <span className="mt-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary-hover dark:text-sky-300">
                            Recomendado
                          </span>
                        )}
                        <span className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{PRODUCT_INFO[p].tagline}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium">Tamanho da clínica</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {plans.map((p) => {
                    const on = tier === p.tier;
                    return (
                      <label
                        key={p.tier}
                        className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 text-sm transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${
                          on ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <input type="radio" name="tier" value={p.tier} checked={on} onChange={() => setTier(p.tier)} className="sr-only" />
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{tamanho(p, product)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {plano && (
                <p className="rounded-lg bg-surface-alt px-4 py-3 text-sm" aria-live="polite">
                  <strong className="font-semibold">14 dias grátis, sem cartão.</strong> Depois, se quiser continuar, o{' '}
                  {PRODUCT_INFO[product].name} {plano.name} custa{' '}
                  <strong className="font-semibold tabular-nums">{brl(productPriceCents(plano, product))}/mês</strong>, por PIX, boleto
                  ou cartão. Sem fidelidade.
                </p>
              )}
            </div>
          )}

          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="touch-target w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {isPending ? 'Criando conta...' : 'Começar o teste grátis'}
          </button>
        </form>
      </div>
    </main>
  );
}
