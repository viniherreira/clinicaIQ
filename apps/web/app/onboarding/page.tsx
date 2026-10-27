import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@clinicaiq/db';
import { DEFAULT_CHOICE, parseProduct, parseTier } from '@/lib/products';
import { acessoEncerrado, joinFromInviteIfAny } from './actions';
import { CreateClinicForm, type TrialPlan } from './_components/create-clinic-form';
import { AcessoEncerrado } from './_components/acesso-encerrado';

export const metadata = { title: 'Configure sua clínica · DreamClin' };

/**
 * Três pessoas chegam nesta rota por motivos diferentes.
 *
 * Quem está abrindo a própria clínica preenche o formulário. Quem foi convidado
 * não deveria nem ver esse formulário — já tem uma clínica esperando por ele, e
 * pedir "nome da sua clínica" para a recepcionista é o jeito mais rápido de
 * acabar com duas clínicas vazias e ninguém entendendo por quê.
 *
 * E quem foi removido de uma clínica precisa ler isso em português, não cair num
 * formulário que não explica nada.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenantId = await joinFromInviteIfAny();
  if (tenantId) redirect('/dashboard');

  // O plano escolhido no site: pela URL de volta do cadastro ou, se ela se
  // perdeu na verificação do e-mail, pelos metadados da conta.
  const sp = await searchParams;
  const meta = ((await currentUser())?.unsafeMetadata ?? {}) as Record<string, unknown>;
  const product = parseProduct(sp.plano) ?? parseProduct(meta.plano) ?? DEFAULT_CHOICE.product;
  const tier = parseTier(sp.tamanho) ?? parseTier(meta.tamanho) ?? DEFAULT_CHOICE.tier;

  const plans: TrialPlan[] = await prisma.plan
    .findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        tier: true,
        name: true,
        maxProfessionals: true,
        monthlyPriceCents: true,
        crmPackagePriceCents: true,
        crmOnlyPriceCents: true,
        crmIncludedSeats: true,
        crmSeatPriceCents: true,
      },
    })
    .catch(() => []);

  const encerrado = await acessoEncerrado();
  if (encerrado) {
    return <AcessoEncerrado clinica={encerrado.clinica} em={encerrado.em} plans={plans} initial={{ product, tier }} />;
  }

  return <CreateClinicForm plans={plans} initial={{ product, tier }} />;
}
