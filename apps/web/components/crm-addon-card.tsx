import Link from 'next/link';
import { KanbanSquare } from 'lucide-react';
import { prisma } from '@clinicaiq/db';
import { currentAccess } from '@/lib/guard';
import { loadCrmAddon } from '@/crm/addon';
import { crmOfferText, formatCents, usersLabel } from '@/crm/format';
import { CrmTurnOnButton } from './crm-turn-on-button';
import { CrmTurnOffButton } from './crm-addon-controls';

const dataBR = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso));

/**
 * O CRM na aba Plano, para quem já assina a Agenda: experimentar 14 dias
 * grátis, quanto soma, em que situação está e o botão de ligar ou desligar. O
 * total do mês mostra plano + CRM.
 *
 * Não aparece para a clínica só com o CRM (o CRM é o plano dela) nem no teste
 * grátis da clínica, em que acrescentar o CRM é escolher o Completo nos planos.
 */
export async function CrmAddonCard() {
  const acesso = await currentAccess();
  if (!acesso) return null;
  const sub = await prisma.subscription.findUnique({
    where: { tenantId: acesso.tenantId },
    select: { clinicEnabled: true, status: true, asaasSubscriptionId: true, complimentary: true },
  });
  if (!sub || !sub.clinicEnabled) return null;
  if (sub.status === 'TRIALING' && !sub.asaasSubscriptionId && !sub.complimentary) return null;
  const a = await loadCrmAddon(acesso.tenantId);
  const oferta = crmOfferText(a);
  const usuarios = usersLabel(a.seats);

  const situacao =
    a.status === 'off'
      ? `Desligado. Com o CRM, o plano vira o Completo: ${oferta}, somado à mensalidade.`
      : a.status === 'trial'
        ? `Em teste grátis até ${dataBR(a.trialEndsAt!)}. Depois, ${oferta} (hoje: ${usuarios} = ${formatCents(a.crmMonthlyCents)}/mês).`
        : a.status === 'complimentary'
          ? 'Incluído na cortesia, sem custo: toda a equipe com perfil de dono, administração ou recepção tem acesso.'
          : `Ativo · ${usuarios} no CRM = ${formatCents(a.crmMonthlyCents)}/mês (${oferta}).`;

  return (
    <section aria-labelledby="crm-adicional" className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KanbanSquare className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="crm-adicional" className="text-base font-semibold">CRM</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Funil de captação com tarefas, que anda sozinho com a agenda e os orçamentos.
          </p>
          <p className="mt-2 text-sm">{situacao}</p>
          {a.status === 'paid' && a.planName && (
            <p className="mt-1 text-sm text-muted-foreground">
              Total do mês: plano {a.planName} {formatCents(a.planPriceCents)} + CRM {formatCents(a.crmMonthlyCents)} ={' '}
              <span className="font-medium text-foreground">{formatCents(a.planPriceCents + a.crmMonthlyCents)}</span>
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {a.status === 'complimentary' ? (
              <Link href="/crm" className="btn-primary btn-md">Abrir o CRM</Link>
            ) : a.status === 'off' ? (
              <CrmTurnOnButton label={a.trialAvailable ? 'Experimentar 14 dias grátis' : 'Ativar o CRM'} />
            ) : (
              <>
                <Link href="#equipe" className="btn-primary btn-md">Escolher quem tem acesso</Link>
                <CrmTurnOffButton />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
