'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
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
      <fieldset className="pick-box">
        <legend className="sr-only">Produto</legend>
        <div className="pick">
          {PRODUCTS.map((p) => (
            <label key={p}>
              <input type="radio" name="produto" checked={produto === p} onChange={() => setProduto(p)} />
              <span>{PRODUCT_INFO[p].name}</span>
            </label>
          ))}
        </div>
        <p className="tagline" aria-live="polite">{PRODUCT_INFO[produto].tagline}</p>
      </fieldset>

      <ul className="plans">
        {visiveis.map((plan, index) => {
          const featured = index === 1;
          const economia = produto === 'COMPLETO' ? bundleSavingsCents(plan) : 0;
          const nome = `${PRODUCT_INFO[produto].name} ${plan.name}`;
          return (
            <li key={plan.tier}>
              <article aria-labelledby={`plano-${plan.tier}`} className={`plan${featured ? ' top' : ''}`}>
                {featured && (
                  <span className="flag">
                    <Sparkles className="ic" aria-hidden="true" /> Mais escolhido
                  </span>
                )}
                <h3 id={`plano-${plan.tier}`}>{nome}</h3>
                <p className="pit">{tierPitch(plan, produto)}</p>
                <p className="val num">
                  {brl(productPriceCents(plan, produto))} <small>/mês</small>
                </p>
                <p className="sav">
                  {economia > 0 ? `Economize ${brl(economia)}/mês frente a Agenda + CRM separados` : 'Depois do teste grátis'}
                </p>
                <ul>
                  {planFeatures(plan, produto).map((f) => (
                    <li key={f}>
                      <Check className="ic" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={signUpHref(produto, plan.tier)} className={`btn ${featured ? 'btn-mint' : 'btn-glass'}`}>
                  Testar grátis<span className="sr-only"> o {nome}</span>
                </Link>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}
