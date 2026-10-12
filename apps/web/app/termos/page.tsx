import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, PrivacyContact } from '@/components/legal-page';
import { COMPANY, companyLine } from '@/lib/company';

export const metadata: Metadata = {
  title: `Termos de Uso · ${COMPANY.brand}`,
  description: `As regras de uso do ${COMPANY.brand} para clínicas.`,
};

/**
 * Termos de Uso. Texto de partida, escrito a partir de como o serviço funciona
 * (planos, adicional do CRM, WhatsApp); precisa da revisão de um advogado.
 */
export default function TermosPage() {
  const b = COMPANY.brand;
  return (
    <LegalPage title="Termos de Uso" updated="12 de outubro de 2026">
      <p>
        Estes termos valem para quem contrata e usa o {b}
        {companyLine() ? <>, serviço de {companyLine()}</> : null}. Ao criar uma conta, a clínica concorda com eles e com a{' '}
        <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>1. O serviço</h2>
      <p>
        O {b} é um sistema online para clínicas odontológicas e estéticas: agenda, pacientes, orçamentos, financeiro, confirmações
        pelo WhatsApp e, como adicional, um CRM de captação com funil de leads e conversas do WhatsApp.
      </p>

      <h2>2. Conta e acesso</h2>
      <ul>
        <li>Quem cria a conta deve ter poderes para representar a clínica e informar dados verdadeiros.</li>
        <li>Cada pessoa da equipe usa o próprio login. A clínica é responsável por quem ela dá acesso e pelos perfis escolhidos.</li>
        <li>Guarde a sua senha em segredo e avise a gente se perceber algum uso indevido.</li>
      </ul>

      <h2>3. Planos, adicional do CRM e cobrança</h2>
      <ul>
        <li>Os planos são mensais, com os preços mostrados no site e dentro do sistema. A cobrança é feita pelo Asaas.</li>
        <li>O CRM é um adicional cobrado por pessoa da equipe com acesso, com teste grátis de 14 dias na primeira ativação.</li>
        <li>Mudanças de preço são avisadas com antecedência e valem a partir do ciclo seguinte.</li>
        <li>Sem pagamento, o acesso pode ficar restrito à consulta dos dados até a regularização.</li>
        <li>
          Mensagens pela API oficial do WhatsApp podem ter custo cobrado pela Meta, conforme a tabela dela; quando houver, ele é
          informado à clínica.
        </li>
      </ul>

      <h2>4. Responsabilidades da clínica</h2>
      <ul>
        <li>
          A clínica é a controladora dos dados dos pacientes e contatos que coloca no sistema. Cabe a ela ter base legal para tratá-los
          e atender aos pedidos dos titulares (o sistema oferece as ferramentas para isso).
        </li>
        <li>
          Mensagens pelo WhatsApp devem seguir as políticas do WhatsApp e da Meta: nada de spam, conteúdo enganoso ou mensagens para
          quem não autorizou. Quem pedir para sair das transmissões não deve receber mais.
        </li>
        <li>As informações clínicas, orçamentos e valores registrados são de responsabilidade da clínica e dos seus profissionais.</li>
      </ul>

      <h2>5. Uso proibido</h2>
      <p>
        Não é permitido usar o {b} para atividades ilegais, tentar acessar dados de outras clínicas, sobrecarregar ou atacar o sistema,
        nem revender o acesso sem autorização.
      </p>

      <h2>6. Disponibilidade e suporte</h2>
      <p>
        Trabalhamos para o sistema ficar no ar o tempo todo, mas podem acontecer paradas para manutenção ou por falhas de terceiros
        (hospedagem, WhatsApp, cobrança). Avisamos paradas programadas sempre que possível.
      </p>

      <h2>7. Dados ao fim do contrato</h2>
      <p>
        A clínica pode cancelar quando quiser. Ao cancelar, pode pedir uma cópia dos seus dados. Depois de um prazo razoável, os dados
        são apagados ou anonimizados, salvo o que a lei obrigar a guardar.
      </p>

      <h2>8. Propriedade intelectual</h2>
      <p>
        O sistema, a marca e o código são do {b}. Os dados da clínica são da clínica: ela pode pedir uma cópia deles, e o {b} só os
        usa para prestar o serviço.
      </p>

      <h2>9. Limitação de responsabilidade</h2>
      <p>
        O {b} não responde por decisões clínicas ou comerciais tomadas com base no sistema, nem por falhas de serviços de terceiros
        fora do nosso controle. Na medida permitida em lei, a responsabilidade total fica limitada ao valor pago nos últimos 12 meses.
      </p>

      <h2>10. Mudanças nestes termos</h2>
      <p>Podemos atualizar estes termos. Mudanças importantes são avisadas no sistema antes de valer.</p>

      <h2>11. Lei e foro</h2>
      <p>
        Vale a lei brasileira. Fica eleito o foro da comarca {COMPANY.city ? `de ${COMPANY.city}` : 'da sede do ' + b}, salvo regra
        legal que garanta outro foro.
      </p>

      <h2>12. Contato</h2>
      <p>
        Dúvidas sobre estes termos: <PrivacyContact />.
      </p>
    </LegalPage>
  );
}
