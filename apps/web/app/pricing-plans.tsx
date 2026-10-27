'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import {
  bundleSavingsCents,
  parseProduct,
  planFeatures,
  productAvailable,
  productPriceCents,
  PRODUCT_INFO,
  PRODUCTS,
  signUpHref,
  tierPitch,
  type Product,
} from '@/lib/products';
import type { PublicPlan } from './pricing-section';

/**
 * Os cartões de preço da página de vendas, com a chave Completo / Agenda / CRM.
 * Os números vêm do banco (os mesmos da tela de Plano); o botão de cada cartão
 * leva ao cadastro com o plano escolhido, e o teste começa nele.
 */

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function PricingPlans({ plans }: { plans: PublicPlan[] }) {
  const [produto, setProduto] = useState<Product>('COMPLETO');

  // "Ver planos do CRM" lá em cima chega aqui como #planos-crm: abre na chave certa.
  useEffect(() => {
    const ler = () => {
      const p = parseProduct(window.location.hash.replace(/^#planos-/, ''));
      if (p) setProduto(p);
    };
    ler();
    window.addEventListener('hashchange', ler);
    return () => window.removeEventListener('hashchange', ler);
  }, []);

  const visiveis = plans.filter((p) => productAvailable(p, produto));

  return (
    <>
      <fieldset className="mt-10 flex flex-col items-center gap-3">
        <legend className="sr-only">Produto</legend>
        <div className="inline-flex rounded-full border border-border bg-background p-1 shadow-sm">
          {PRODUCTS.map((p) => (
            <label
              key={p}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring sm:px-6 ${
                produto === p ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <input type="radio" name="produto" checked={produto === p} onChange={() => setProduto(p)} className="sr-only" />
              {PRODUCT_INFO[p].name}
            </label>
          ))}
        </div>
        <p className="max-w-xl text-center text-sm text-muted-foreground" aria-live="polite">
          {PRODUCT_INFO[produto].tagline}
        </p>
      </fieldset>

      <ul className="mt-10 grid items-start gap-6 lg:grid-cols-3">
        {visiveis.map((plan, index) => {
          const featured = index === 1;
          const economia = produto === 'COMPLETO' ? bundleSavingsCents(plan) : 0;
          const nome = `${PRODUCT_INFO[produto].name} ${plan.name}`;
          return (
            <li key={plan.tier} className={featured ? 'lg:-mt-4' : undefined}>
              <article
                aria-labelledby={`plano-${plan.tier}`}
                className={`relative flex h-full flex-col rounded-2xl border bg-background p-7 transition-shadow hover:shadow-lg ${
                  featured ? 'border-primary/50 shadow-lg ring-1 ring-primary/20' : 'border-border'
                }`}
              >
                {featured && (
                  <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    <Sparkles className="h-3 w-3" aria-hidden="true" /> Mais escolhido
                  </span>
                )}

                <h3 id={`plano-${plan.tier}`} className="mt-1 text-xl font-bold tracking-tight">
                  {nome}
                </h3>
                <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-muted-foreground">{tierPitch(plan, produto)}</p>

                <p className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-4xl font-bold tracking-tight tabular-nums">{brl(productPriceCents(plan, produto))}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </p>
                <p className="mt-1 min-h-[1.25rem] text-xs text-muted-foreground">
                  {economia > 0 ? (
                    <>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Economize {brl(economia)}/mês</span> frente
                      a Agenda + CRM separados
                    </>
                  ) : (
                    'Depois do teste grátis'
                  )}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {planFeatures(plan, produto).map((f) => (
                    <li key={f} className="flex gap-3 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={signUpHref(produto, plan.tier)}
                  className={`${featured ? 'btn-primary' : 'btn-outline'} btn-md mt-8 w-full justify-center !rounded-full`}
                >
                  Testar grátis<span className="sr-only"> o {nome}</span>
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
