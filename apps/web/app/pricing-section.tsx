/**
 * Os preços da página de vendas.
 *
 * Lê as mesmas linhas de `plans` que a tela de Plano usa, então mudar um preço é
 * um update e a vitrine nunca discorda do caixa — o tipo de diferença que custa
 * confiança justo na hora em que a pessoa decide pagar. Cada tamanho aparece nos
 * três produtos (`pricing-plans.tsx` tem a chave), seguido de como funciona o
 * teste e do comparativo.
 */
import { BadgeCheck, Check, CreditCard, Minus, MousePointerClick, ShieldCheck, Sparkles } from 'lucide-react';
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
    icon: MousePointerClick,
    title: 'Escolha e crie a conta',
    text: 'Leva um minuto. Não pedimos cartão.',
  },
  {
    icon: Sparkles,
    title: `Use por ${TRIAL_DAYS} dias`,
    text: 'Com a equipe, a agenda e o WhatsApp de verdade. Trocar de plano no teste é grátis.',
  },
  {
    icon: CreditCard,
    title: 'Assine se gostar',
    text: 'Assinando no teste, a primeira cobrança só vence quando ele acaba. PIX, boleto ou cartão.',
  },
  {
    icon: ShieldCheck,
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
      { recurso: 'LGPD, dados sensíveis criptografados e backup diário', agenda: true, crm: true, completo: true },
      { recurso: 'Suporte por WhatsApp e acessibilidade WCAG 2.1 AA', agenda: true, crm: true, completo: true },
    ],
  },
];

function Marca({ sim }: { sim: boolean }) {
  return sim ? (
    <>
      <Check className="mx-auto h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      <span className="sr-only">Incluído</span>
    </>
  ) : (
    <>
      <Minus className="mx-auto h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
      <span className="sr-only">Não incluído</span>
    </>
  );
}

export function Pricing({ plans }: { plans: PublicPlan[] }) {
  if (plans.length === 0) return null;

  return (
    <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-20 border-y border-border bg-surface py-16 lg:py-24">
      {/* Os cartões de produto lá em cima levam direto para a chave certa. */}
      <span id="planos-completo" className="block scroll-mt-20" aria-hidden="true" />
      <span id="planos-agenda" className="block scroll-mt-20" aria-hidden="true" />
      <span id="planos-crm" className="block scroll-mt-20" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Planos e preços</p>
          <h2 id="planos-titulo" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Preço claro, do consultório à clínica grande
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Comece com {TRIAL_DAYS} dias grátis, sem cartão. Pague por mês, por PIX, boleto ou cartão. Sem fidelidade e sem
            taxa de instalação.
          </p>
        </div>

        <PricingPlans plans={plans} />

        <div className="mx-auto mt-10 flex max-w-3xl items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-emerald-950 dark:text-emerald-100">
            <strong>Todos os planos usam a API oficial do WhatsApp, da Meta.</strong> As mensagens saem do número da sua clínica,
            sem QR code e sem celular ligado o dia todo. As conversas são cobradas pela Meta direto da clínica, conforme a
            tabela dela.
          </p>
        </div>

        {/* Como funciona o teste */}
        <div className="mt-16">
          <h3 className="text-center text-xl font-bold tracking-tight sm:text-2xl">Como funciona o teste grátis</h3>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TESTE.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative rounded-2xl border border-border bg-background p-5">
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-hover dark:text-sky-300">
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs font-medium tabular-nums text-muted-foreground" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </span>
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Comparativo */}
        <div className="mt-16">
          <h3 className="text-center text-xl font-bold tracking-tight sm:text-2xl">Compare os planos</h3>
          {/* `relative`: os "Incluído" só para leitor de tela (absolutos) ficam dentro da rolagem, sem esticar a página no celular. */}
          <div className="relative mt-8 overflow-x-auto rounded-2xl border border-border bg-background">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">O que cada produto inclui: Agenda, CRM e Completo</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-5 py-4 text-left font-semibold">Recurso</th>
                  <th scope="col" className="w-28 px-3 py-4 text-center font-semibold">Agenda</th>
                  <th scope="col" className="w-28 px-3 py-4 text-center font-semibold">CRM</th>
                  <th scope="col" className="w-28 bg-primary/5 px-3 py-4 text-center font-semibold text-primary-hover dark:text-sky-300">
                    Completo
                  </th>
                </tr>
              </thead>
              {COMPARATIVO.map((g) => (
                <tbody key={g.grupo}>
                  <tr className="border-b border-border bg-surface-alt/60">
                    <th scope="colgroup" colSpan={4} className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.grupo}
                    </th>
                  </tr>
                  {g.linhas.map((l) => (
                    <tr key={l.recurso} className="border-b border-border last:border-0">
                      <th scope="row" className="px-5 py-3 text-left font-normal">{l.recurso}</th>
                      <td className="px-3 py-3 text-center"><Marca sim={l.agenda} /></td>
                      <td className="px-3 py-3 text-center"><Marca sim={l.crm} /></td>
                      <td className="bg-primary/5 px-3 py-3 text-center"><Marca sim={l.completo} /></td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
