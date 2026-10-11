import Link from 'next/link';
import { KanbanSquare } from 'lucide-react';
import { currentAccess } from '@/lib/guard';
import { loadCrmAddon } from '@/crm/addon';
import { formatCents } from '@/crm/format';
import { CrmTurnOnButton } from './crm-turn-on-button';
import { CrmTurnOffButton } from './crm-addon-controls';

const dataBR = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso));

/**
 * O CRM na aba Plano: o adicional, quanto custa, em que situação está e o
 * botão de ligar ou desligar. O total do mês mostra plano + CRM.
 */
export async function CrmAddonCard() {
  const acesso = await currentAccess();
  if (!acesso) return null;
  const a = await loadCrmAddon(acesso.tenantId);
  const preco = formatCents(a.seatPriceCents);
  const usuarios = `${a.seats} ${a.seats === 1 ? 'usuário' : 'usuários'}`;

  const situacao =
    a.status === 'off'
      ? `Desligado. ${preco} por usuário por mês, somado à mensalidade.`
      : a.status === 'trial'
        ? `Em teste grátis até ${dataBR(a.trialEndsAt!)}. Depois, ${preco} por usuário (hoje: ${usuarios} = ${formatCents(a.crmMonthlyCents)}/mês).`
        : a.status === 'complimentary'
          ? 'Incluído na cortesia, sem custo: toda a equipe com perfil de dono, administração ou recepção tem acesso.'
          : `Ativo · ${usuarios} × ${preco} = ${formatCents(a.crmMonthlyCents)}/mês.`;

  return (
    <section aria-labelledby="crm-adicional" className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KanbanSquare className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="crm-adicional" className="text-base font-semibold">CRM · adicional</h2>
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
