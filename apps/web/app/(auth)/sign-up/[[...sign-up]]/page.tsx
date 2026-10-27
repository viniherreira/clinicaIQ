import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@clinicaiq/db';
import { clerkAppearance } from '@/lib/clerk-appearance';
import { TRIAL_DAYS } from '@/lib/subscription';
import { parseProduct, parseTier, productPriceCents, productSlug, PRODUCT_INFO, tierSlug } from '@/lib/products';
import { InviteBlocked } from '../_components/invite-blocked';

export const metadata = { title: 'Criar conta' };

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // O Clerk pendura o convite na URL como `__clerk_ticket`.
  const bruto = params.__clerk_ticket;
  const ticket = typeof bruto === 'string' ? bruto : null;

  if (ticket) {
    const eu = await currentUser();
    if (eu) {
      const quem =
        eu.primaryEmailAddress?.emailAddress ||
        eu.emailAddresses[0]?.emailAddress ||
        `${eu.firstName ?? ''} ${eu.lastName ?? ''}`.trim() ||
        'outra conta';
      return <InviteBlocked ticket={ticket} quem={quem} />;
    }
    return <SignUp appearance={clerkAppearance} />;
  }

  // O plano que a pessoa escolheu no site segue com ela: na URL de volta do
  // Clerk e nos metadados da conta (se a verificação de e-mail perder a URL,
  // o onboarding ainda acha). Sem escolha, o onboarding sugere o Completo.
  const product = parseProduct(params.plano);
  const tier = parseTier(params.tamanho);
  const escolha = product && tier ? `?plano=${productSlug(product)}&tamanho=${tierSlug(tier)}` : '';
  const plano = product && tier ? await prisma.plan.findUnique({ where: { tier } }).catch(() => null) : null;

  return (
    <div className="space-y-5">
      {product && tier && plano && (
        <p className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="block font-semibold">
            Teste grátis do {PRODUCT_INFO[product].name} {plano.name}
          </span>
          <span className="text-muted-foreground">
            {TRIAL_DAYS} dias sem pagar e sem cartão. Depois, {brl(productPriceCents(plano, product))}/mês se quiser continuar.{' '}
            <Link href="/#planos" className="font-medium text-link underline underline-offset-2">
              Trocar
            </Link>
          </span>
        </p>
      )}
      <SignUp
        appearance={clerkAppearance}
        forceRedirectUrl={`/onboarding${escolha}`}
        unsafeMetadata={product && tier ? { plano: productSlug(product), tamanho: tierSlug(tier) } : undefined}
      />
    </div>
  );
}
