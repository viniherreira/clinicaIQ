import { redirect } from 'next/navigation';
import { acessoEncerrado, joinFromInviteIfAny } from './actions';
import { CreateClinicForm } from './_components/create-clinic-form';
import { AcessoEncerrado } from './_components/acesso-encerrado';

export const metadata = { title: 'Configure sua clínica · ClinicaIQ' };

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
export default async function OnboardingPage() {
  const tenantId = await joinFromInviteIfAny();
  if (tenantId) redirect('/dashboard');

  const encerrado = await acessoEncerrado();
  if (encerrado) return <AcessoEncerrado clinica={encerrado.clinica} em={encerrado.em} />;

  return <CreateClinicForm />;
}
