import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { COMPANY } from '@/lib/company';

export const metadata: Metadata = {
  title: `Como conectar o WhatsApp · ${COMPANY.brand}`,
  description: `Passo a passo para a clínica ligar o próprio número de WhatsApp ao ${COMPANY.brand} pela API oficial da Meta.`,
};

/**
 * Ajuda para a clínica ligar o próprio número pelo botão "Conectar com a Meta"
 * (cadastro incorporado). Pública: o suporte manda o link antes de a pessoa
 * entrar no sistema. O botão das telas de WhatsApp aponta para cá.
 */
export default function ConectarWhatsAppPage() {
  const b = COMPANY.brand;
  return (
    <LegalPage title="Como conectar o WhatsApp da clínica" updated="26 de outubro de 2026">
      <p>
        O {b} usa a API oficial do WhatsApp, da Meta. A clínica liga o próprio número em uns 5 minutos, sem instalar nada, e o
        celular continua funcionando. Depois de ligado, as conversas aparecem no CRM e a agenda manda a confirmação e o lembrete das
        consultas.
      </p>

      <h2>Antes de começar</h2>
      <ul>
        <li>O celular com o <strong>WhatsApp Business</strong> do número da clínica na mão, com o app atualizado.</li>
        <li>Uma conta no <strong>Facebook</strong> de quem é responsável pela clínica.</li>
        <li>
          O número não pode estar ligado a outro sistema que usa a API do WhatsApp (outro CRM, chatbot ou plataforma de disparos). Se
          estiver, desconecte lá antes.
        </li>
        <li>Fazer pelo computador, com o bloqueador de janelas (pop-up) desligado para o {b}.</li>
      </ul>

      <h2>1. No {b}</h2>
      <ol>
        <li>
          Entre em <strong>WhatsApp</strong>, no menu da agenda ou do CRM.
        </li>
        <li>
          Deixe marcada a opção <strong>&ldquo;Usar o número que já está no WhatsApp Business do celular da clínica&rdquo;</strong>.
        </li>
        <li>
          Clique em <strong>Conectar com a Meta</strong>. Abre uma janela da Meta por cima da tela.
        </li>
      </ol>

      <h2>2. Na janela da Meta</h2>
      <ol>
        <li>Entre com o Facebook e aceite que o {b} gerencie o WhatsApp da clínica.</li>
        <li>
          Escolha a <strong>empresa</strong> (portfólio empresarial). Se a clínica ainda não tiver, crie ali mesmo: nome da clínica,
          site ou Instagram e país.
        </li>
        <li>
          Escolha <strong>conectar o app WhatsApp Business existente</strong> e digite o número da clínica.
        </li>
        <li>
          No celular, abra o WhatsApp Business: chega uma mensagem para confirmar, ou aparece um QR code no computador para ler com o
          celular.
        </li>
        <li>
          O app pergunta se quer <strong>compartilhar o histórico</strong> das conversas (até 6 meses). Aceitando, as conversas
          recentes aparecem no CRM.
        </li>
        <li>Conclua. A janela fecha sozinha.</li>
      </ol>

      <h2>3. De volta no {b}</h2>
      <ul>
        <li>
          A tela mostra <strong>&ldquo;API oficial conectada&rdquo;</strong>, com o número e o nome da clínica.
        </li>
        <li>
          Os modelos dos avisos da agenda (confirmação e lembrete) vão sozinhos para a Meta aprovar. A situação de cada um fica em
          Configurações › Comunicação › <strong>Modelos do WhatsApp</strong>; costuma sair em minutos.
        </li>
      </ul>

      <h2>4. Cadastre a forma de pagamento na Meta</h2>
      <p>
        Responder quem escreveu para a clínica nas últimas 24 horas não tem custo. Já a confirmação e o lembrete das consultas são
        mensagens que a Meta cobra por envio, direto da clínica, e <strong>só saem com um cartão cadastrado</strong>:
      </p>
      <ol>
        <li>
          Entre em <a href="https://business.facebook.com/billing_hub/accounts" target="_blank" rel="noreferrer">business.facebook.com › Cobrança e pagamentos<span className="sr-only"> (abre em nova aba)</span></a>.
        </li>
        <li>Escolha a conta do WhatsApp Business da clínica.</li>
        <li>
          Clique em <strong>Adicionar forma de pagamento</strong> e cadastre o cartão.
        </li>
      </ol>
      <p>Sem o cartão, a confirmação aparece na agenda como &ldquo;Não enviada&rdquo;, com o motivo.</p>

      <h2>Cuidados com o celular</h2>
      <ul>
        <li>O que a clínica responde pelo celular aparece no CRM, e o que responde pelo CRM aparece no celular.</li>
        <li>
          Regra da Meta: abra o <strong>WhatsApp Business no celular pelo menos uma vez a cada 14 dias</strong>, senão a ligação com o
          celular cai.
        </li>
        <li>
          No app do celular, listas de transmissão e mensagens temporárias ou de visualização única deixam de funcionar. Grupos não vão
          para o CRM.
        </li>
      </ul>

      <h2>Número sem WhatsApp (chip novo)</h2>
      <p>
        Desmarque a opção do passo 1 antes de clicar em Conectar com a Meta. Na janela da Meta, crie o perfil (o nome que os pacientes
        vão ver e a categoria) e confirme o número pelo código que chega por SMS ou ligação. Esse número passa a funcionar só pelo{' '}
        {b}, não pelo app do celular.
      </p>

      <h2>Se algo der errado</h2>
      <ul>
        <li>
          <strong>A janela da Meta não abre:</strong> libere as janelas (pop-up) para o {b} no navegador e desligue bloqueadores de
          anúncio ou VPN.
        </li>
        <li>
          <strong>&ldquo;Número já registrado&rdquo; ou &ldquo;em uso em outra conta&rdquo;:</strong> o número está ligado a outro
          sistema. Desconecte lá e tente de novo.
        </li>
        <li>
          <strong>Fechou a janela no meio:</strong> é só clicar em Conectar com a Meta outra vez.
        </li>
        <li>
          <strong>Conectou, mas a confirmação das consultas não chega:</strong> confira a forma de pagamento (passo 4) e se os modelos
          estão aprovados em Modelos do WhatsApp.
        </li>
      </ul>
    </LegalPage>
  );
}
