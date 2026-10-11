import { getBillingData } from '../../planos/actions';
import { BillingView } from '../../planos/_components/billing-view';
import { CrmAddonCard } from '@/components/crm-addon-card';

/**
 * O plano inteiro dentro da aba de Configurações.
 *
 * Antes existiam dois lugares: um cartão de resumo aqui e a tela de verdade em
 * /planos. Duas telas para a mesma coisa é uma a mais — a clínica procura tudo
 * sobre a própria conta em Configurações, então é aqui que a escolha do plano e
 * o pagamento acontecem.
 *
 * Vive num componente próprio porque busca cobranças no Asaas: envolto em
 * Suspense, as outras abas aparecem sem esperar a rede.
 */
export async function BillingPanel() {
  const data = await getBillingData();
  return (
    <>
      <BillingView data={data} embutido />
      <CrmAddonCard />
    </>
  );
}
