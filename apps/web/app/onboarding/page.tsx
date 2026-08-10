import { redirect } from 'next/navigation';
import { joinFromInviteIfAny } from './actions';
import { CreateClinicForm } from './_components/create-clinic-form';

export const metadata = { title: 'Configure sua clínica · ClinicaIQ' };

/**
 * Duas pessoas chegam nesta rota por motivos opostos.
 *
 * Quem está abrindo a própria clínica preenche o formulário. Quem foi convidado
 * não deveria nem ver esse formulário — ele já tem uma clínica esperando por
 * ele, e pedir "nome da sua clínica" para a recepcionista é o jeito mais rápido
 * de acabar com duas clínicas vazias e ninguém entendendo por quê.
 *
 * Por isso o convite é resolvido aqui, antes de renderizar qualquer coisa.
 */
export default async function OnboardingPage() {
  const tenantId = await joinFromInviteIfAny();
  if (tenantId) redirect('/dashboard');

  return <CreateClinicForm />;
}
