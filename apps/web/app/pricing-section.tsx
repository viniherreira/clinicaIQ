/**
 * Os preços da página de vendas.
 *
 * Lê as mesmas linhas de `plans` que a tela de Plano usa, então mudar um preço é
 * um update e a vitrine nunca discorda do caixa — o tipo de diferença que custa
 * confiança justo na hora em que a pessoa decide pagar. Cada tamanho aparece nos
 * três produtos (`pricing-plans.tsx` tem a chave), seguido de como funciona o
 * teste e do comparativo.
 */
import { Check, ChevronsUpDown } from 'lucide-react';
import { prisma } from '@clinicaiq/db';
import { TRIAL_DAYS } from '@/lib/subscription';
import type { PlanShowcase, Tier } from '@/lib/products';
import { PricingPlans } from './pricing-plans';

export interface PublicPlan extends PlanShowcase {
  tier: Tier;
  name: string;
}

/** Os planos à venda, ou lista vazia se o banco falhar — o resto do site aparece mesmo assim. */
export async function loadPublicPlans(): Promise<PublicPlan[]> {
  try {
    return await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        tier: true,
        name: true,
        description: true,
        monthlyPriceCents: true,
        maxProfessionals: true,
        campaignsEnabled: true,
        advancedReports: true,
        crmPackagePriceCents: true,
        crmIncludedSeats: true,
        crmSeatPriceCents: true,
        crmOnlyPriceCents: true,
      },
    });
  } catch {
    return [];
  }
}

const TESTE = [
  {
    title: 'Escolha e crie a conta',
    text: 'Leva um minuto. Não pedimos cartão.',
  },
  {
    title: `Use por ${TRIAL_DAYS} dias`,
    text: 'Com a equipe, a agenda e o WhatsApp de verdade. Trocar de plano no teste é grátis.',
  },
  {
    title: 'Assine se gostar',
    text: 'Assinando no teste, a primeira cobrança só vence quando ele acaba. PIX, boleto ou cartão.',
  },
  {
    title: 'Não gostou? Nada a pagar',
    text: 'Sem assinatura, nada é cobrado. A conta fica só para consulta, com os dados guardados.',
  },
];

type Linha = { recurso: string; agenda: boolean; crm: boolean; completo: boolean };

const COMPARATIVO: { grupo: string; linhas: Linha[] }[] = [
  {
    grupo: 'Rotina da clínica',
    linhas: [
      { recurso: 'Agenda por profissional e agendamento online', agenda: true, crm: false, completo: true },
      { recurso: 'Pacientes, prontuário e odontograma', agenda: true, crm: false, completo: true },
      { recurso: 'Orçamentos com link de aprovação e PDF', agenda: true, crm: false, completo: true },
      { recurso: 'Financeiro e relatórios', agenda: true, crm: false, completo: true },
      { recurso: 'Confirmação e lembretes com botões no WhatsApp', agenda: true, crm: false, completo: true },
    ],
  },
  {
    grupo: 'Captação de pacientes',
    linhas: [
      { recurso: 'Funis em quadro, com etapas que você edita', agenda: false, crm: true, completo: true },
      { recurso: 'Conversas do WhatsApp com toda a equipe', agenda: false, crm: true, completo: true },
      { recurso: 'Robô de atendimento e transmissões', agenda: false, crm: true, completo: true },
      { recurso: 'Tarefas, painel de vendas e importação de planilha', agenda: false, crm: true, completo: true },
    ],
  },
  {
    grupo: 'Integração',
    linhas: [
      { recurso: 'O card anda sozinho quando agenda, falta ou aprova o orçamento', agenda: false, crm: false, completo: true },
      { recurso: 'Lead vira paciente com um clique, sem digitar de novo', agenda: false, crm: false, completo: true },
    ],
  },
  {
    grupo: 'Em todos os planos',
    linhas: [
      { recurso: 'WhatsApp oficial da Meta no número da clínica', agenda: true, crm: true, completo: true },
      { recurso: 'LGPD e dados sensíveis criptografados', agenda: true, crm: true, completo: true },
      { recurso: 'Suporte por WhatsApp e acessibilidade WCAG 2.1 AA', agenda: true, crm: true, completo: true },
    ],
  },
];

function Marca({ sim }: { sim: boolean }) {
  return sim ? (
    <>
      <Check className="ic" aria-hidden="true" />
      <span className="sr-only">Incluído</span>
    </>
  ) : (
    <>
      <span className="no" aria-hidden="true" />
      <span className="sr-only">Não incluído</span>
    </>
  );
}

export function Pricing({ plans }: { plans: PublicPlan[] }) {
  if (plans.length === 0) return null;

  return (
    <section className="night inner" id="planos" aria-labelledby="planos-titulo">
      {/* Os produtos lá em cima levam direto para a chave certa. */}
      <span id="planos-completo" aria-hidden="true" />
      <span id="planos-agenda" aria-hidden="true" />
      <span id="planos-crm" aria-hidden="true" />
      <div className="sec-head sec-head-sm">
        <h2 id="planos-titulo" data-r>Preço claro, do consultório à clínica grande.</h2>
        <p className="lede" data-r style={{ '--i': 1 } as React.CSSProperties}>
          Comece com {TRIAL_DAYS} dias grátis, sem cartão. Pague por mês, por PIX, boleto ou cartão. Sem fidelidade e sem taxa de
          instalação.
        </p>
      </div>

      <PricingPlans plans={plans} />

      <p className="meta">
        Todos os planos usam a API oficial do WhatsApp, da Meta. As mensagens saem do número da sua clínica, sem QR code e sem
        celular ligado o dia todo. As conversas são cobradas pela Meta direto da clínica, conforme a tabela dela.
      </p>

      {/* Como funciona o teste: uma estrela por dia. */}
      <div className="nights" data-r>
        <h3>{TRIAL_DAYS} dias para ter certeza.</h3>
        <div className="row14" aria-hidden="true">
          {Array.from({ length: TRIAL_DAYS }, (_, i) => (
            <svg key={i} viewBox="0 0 24 24"><use href="#lp-star" /></svg>
          ))}
        </div>
        <ol className="steps">
          {TESTE.map(({ title, text }) => (
            <li key={title}>
              <b>{title}</b>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Comparativo */}
      <details className="cmp">
        <summary>
          Comparar tudo o que cada produto inclui <ChevronsUpDown className="ic" aria-hidden="true" />
        </summary>
        {/* `relative`: os "Incluído" só para leitor de tela (absolutos) ficam dentro da rolagem, sem esticar a página no celular. */}
        <div className="cmp-scroll">
          <table>
            <caption className="sr-only">O que cada produto inclui: Agenda, CRM e Completo</caption>
            <thead>
              <tr>
                <th scope="col">Recurso</th>
                <th scope="col">Agenda</th>
                <th scope="col">CRM</th>
                <th scope="col">Completo</th>
              </tr>
            </thead>
            {COMPARATIVO.map((g) => (
              <tbody key={g.grupo}>
                <tr>
                  <th scope="colgroup" colSpan={4}>{g.grupo}</th>
                </tr>
                {g.linhas.map((l) => (
                  <tr key={l.recurso}>
                    <th scope="row">{l.recurso}</th>
                    <td><Marca sim={l.agenda} /></td>
                    <td><Marca sim={l.crm} /></td>
                    <td><Marca sim={l.completo} /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </details>
    </section>
  );
}
