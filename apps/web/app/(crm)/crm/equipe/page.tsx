import { requireCrm } from '@/crm/guard';
import { loadTeam } from '@/crm/team';
import { loadCrmAddon } from '@/crm/addon';
import { formatCents } from '@/crm/format';
import { can } from '@/lib/permissions';
import { TeamView } from './_components/team-view';

export const metadata = { title: 'Equipe e distribuição · DreamClin' };

/**
 * CRM › Equipe e distribuição, como os Usuários do Kommo: quem usa o CRM, com
 * que cargo, quem está disponível e como os leads novos são repartidos.
 */
export default async function EquipePage() {
  const ctx = await requireCrm('crm_config');
  const [team, addon] = await Promise.all([loadTeam(ctx.tenantId), loadCrmAddon(ctx.tenantId)]);

  // A chave de acesso (a que conta na mensalidade) é de quem cuida da equipe da clínica.
  const seats =
    can(ctx.role, 'equipe') && addon.status !== 'complimentary' && addon.status !== 'off'
      ? {
          hint:
            addon.status === 'trial'
              ? 'grátis no teste'
              : addon.packagePriceCents > 0
                ? `${addon.includedSeats} no plano; a mais, ${formatCents(addon.seatPriceCents)}/mês`
                : `${formatCents(addon.seatPriceCents)}/mês`,
        }
      : null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-5">
        <h1 className="text-base font-semibold uppercase tracking-wide">Equipe e distribuição</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Quem atende no CRM, o cargo de cada um e como os leads novos do WhatsApp são repartidos.
        </p>
      </div>
      <div className="flex-1 bg-board p-4 sm:p-5">
        <TeamView
          members={team.members}
          distribution={team.distribution}
          unassigned={team.unassigned}
          meId={ctx.userId}
          seats={seats}
          wholeTeam={addon.status === 'complimentary'}
        />
      </div>
    </div>
  );
}
