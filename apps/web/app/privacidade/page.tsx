import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, PrivacyContact } from '@/components/legal-page';
import { COMPANY, companyLine } from '@/lib/company';

export const metadata: Metadata = {
  title: `Política de Privacidade · ${COMPANY.brand}`,
  description: `Como o ${COMPANY.brand} trata dados pessoais, de acordo com a LGPD.`,
};

/**
 * Política de Privacidade. Texto de partida, escrito a partir do que o sistema
 * faz de verdade; precisa da revisão de um advogado antes de valer como final.
 */
export default function PrivacidadePage() {
  const b = COMPANY.brand;
  return (
    <LegalPage title="Política de Privacidade" updated="12 de outubro de 2026">
      <p>
        Esta política explica como o {b} trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a
        &ldquo;LGPD&rdquo;).
        {companyLine() && <> O {b} é um serviço de {companyLine()}.</>}
      </p>

      <h2>1. Os dois papéis do {b}</h2>
      <p>O {b} é um sistema de gestão e de relacionamento para clínicas odontológicas e estéticas. Por isso, trata dados em dois papéis:</p>
      <ul>
        <li>
          <strong>Controlador</strong> dos dados de quem contrata e usa o sistema: o cadastro da clínica, das pessoas da equipe e os
          dados de cobrança.
        </li>
        <li>
          <strong>Operador</strong> dos dados que cada clínica coloca no sistema sobre os pacientes dela e sobre os contatos do CRM
          (leads e conversas). Nesses casos, quem decide o que fazer com os dados é a clínica, que é a controladora; o {b} trata os
          dados só para prestar o serviço, conforme as instruções da clínica.
        </li>
      </ul>
      <p>
        Se você é paciente ou contato de uma clínica que usa o {b}, os pedidos sobre os seus dados (acesso, correção, exclusão) devem
        ser feitos à clínica. Nós ajudamos a clínica a atendê-los.
      </p>

      <h2>2. Que dados tratamos</h2>
      <h3>Da clínica e da equipe</h3>
      <ul>
        <li>Nome, e-mail, telefone, perfil de acesso e registros de uso (como entradas no sistema e ações importantes).</li>
        <li>Dados da clínica (nome, CNPJ ou CPF, endereço) e de cobrança do plano.</li>
      </ul>
      <h3>Inseridos pela clínica</h3>
      <ul>
        <li>Pacientes: nome, CPF, telefone, e-mail, data de nascimento, agendamentos, orçamentos, pagamentos e informações clínicas que a clínica registrar (como ficha, anamnese e odontograma).</li>
        <li>CRM: contatos interessados (leads), etapas do funil, tarefas, anotações e as conversas do WhatsApp da clínica, inclusive arquivos enviados e recebidos.</li>
      </ul>

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Prestar o serviço: agenda, confirmações e lembretes, orçamentos, financeiro, CRM e conversas do WhatsApp.</li>
        <li>Criar e proteger as contas, controlar o acesso de cada pessoa e registrar ações sensíveis para auditoria.</li>
        <li>Cobrar o plano e emitir as cobranças.</li>
        <li>Dar suporte, corrigir problemas e melhorar o sistema.</li>
        <li>Cumprir obrigações legais e regulatórias.</li>
      </ul>
      <p>Não vendemos dados pessoais e não os usamos para publicidade de terceiros.</p>

      <h2>4. Bases legais</h2>
      <p>
        Tratamos dados com base na execução do contrato com a clínica, no cumprimento de obrigações legais, no legítimo interesse
        (por exemplo, segurança e prevenção de fraudes) e, para dados de saúde, nas hipóteses do art. 11 da LGPD aplicáveis à
        clínica, como a tutela da saúde por profissionais de saúde. Cabe à clínica, como controladora, ter base legal para os dados
        dos pacientes e contatos dela e, quando necessário, o consentimento para mensagens.
      </p>

      <h2>5. WhatsApp</h2>
      <p>
        As mensagens enviadas e recebidas pelo WhatsApp passam pela plataforma do WhatsApp, da Meta, que também trata esses dados de
        acordo com as políticas dela. As mensagens ficam guardadas no {b} para a clínica acompanhar as conversas. Quem não quiser
        receber mensagens de transmissão pode responder &ldquo;SAIR&rdquo;.
      </p>

      <h2>6. Com quem compartilhamos</h2>
      <p>Compartilhamos dados só com fornecedores que precisamos para o serviço funcionar, sob contrato e com segurança:</p>
      <ul>
        <li>Hospedagem e infraestrutura (Vercel e Supabase): o sistema, o banco de dados e os arquivos.</li>
        <li>Login e autenticação (Clerk).</li>
        <li>Cobrança (Asaas).</li>
        <li>Mensagens (WhatsApp Business Platform, da Meta).</li>
      </ul>
      <p>
        Alguns desses fornecedores ficam fora do Brasil, como nos Estados Unidos. Essas transferências seguem o art. 33 da LGPD, com
        cláusulas contratuais e as garantias de segurança desses fornecedores. Também podemos compartilhar dados quando a lei ou uma
        ordem de autoridade exigir.
      </p>

      <h2>7. Segurança</h2>
      <ul>
        <li>CPF, telefone e o texto das conversas ficam cifrados no banco (AES-256-GCM), com chave separada por clínica.</li>
        <li>Cada clínica só vê os próprios dados, e cada pessoa da equipe só acessa o que o perfil dela permite.</li>
        <li>Arquivos ficam em armazenamento privado, abertos só por links temporários.</li>
        <li>Ações sensíveis, como ver o telefone completo de um lead ou apagar dados a pedido, ficam registradas.</li>
      </ul>

      <h2>8. Por quanto tempo guardamos</h2>
      <p>
        Guardamos os dados enquanto a clínica usar o {b}. Quando o contrato termina, a clínica pode pedir uma cópia dos dados; depois
        disso, eles são apagados ou anonimizados em prazo razoável, salvo o que a lei obrigar a guardar (como registros fiscais e de
        acesso). Os prontuários de saúde são de responsabilidade da clínica, que deve observar os prazos de guarda da sua profissão.
      </p>

      <h2>9. Direitos do titular</h2>
      <p>
        A LGPD (art. 18) garante, entre outros, os direitos de confirmar e acessar os dados, corrigi-los, pedir a anonimização, o
        bloqueio ou a eliminação, a portabilidade e informações sobre o compartilhamento. Para pacientes e contatos de uma clínica, o
        pedido vai para a clínica, que tem no sistema as ferramentas para atender (inclusive apagar os dados de uma pessoa no CRM).
        Para os demais casos, fale com a gente em <PrivacyContact />.
      </p>

      <h2>10. Cookies</h2>
      <p>
        Usamos só os cookies necessários para o login e a segurança da sessão. A preferência de tema (claro ou escuro) fica guardada
        no próprio navegador. Não usamos cookies de publicidade.
      </p>

      <h2>11. Mudanças nesta política</h2>
      <p>Podemos atualizar esta política. A data no topo mostra a última mudança; mudanças importantes serão avisadas no sistema.</p>

      <h2>12. Contato</h2>
      <p>
        Dúvidas ou pedidos sobre dados pessoais: <PrivacyContact />. Veja também os <Link href="/termos">Termos de Uso</Link>.
      </p>
    </LegalPage>
  );
}
