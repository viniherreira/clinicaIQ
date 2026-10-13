import { requireCrm } from '@/crm/guard';
import { loadCrmBasics } from '@/crm/page-data';
import { AutomationsTab, type AutomationRow } from '../../configuracoes/_components/automations-tab';

export const metadata = { title: 'Automações por etapa · ClinicaIQ' };

/** O "funil digital" do Kommo: o que acontece sozinho quando o lead entra em cada etapa. */
export default async function AutomacoesEtapasPage() {
  const ctx = await requireCrm('crm_config');
  const [basics, automations, templates] = await Promise.all([
    loadCrmBasics(ctx),
    ctx.db.stageAutomation.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, stageId: true, action: true, config: true, delayMinutes: true, active: true },
    }),
    ctx.db.messageTemplate.findMany({ where: { status: 'APPROVED' }, orderBy: { name: 'asc' }, select: { id: true, name: true, variables: true } }),
  ]);
  // Todas as etapas, inclusive Fechou e Perdeu (dá para agradecer quem fechou).
  const varios = basics.pipelines.length > 1;
  const nomeFunil = new Map(basics.pipelines.map((p) => [p.id, p.name]));
  const stages = basics.allStages.map((s) => ({ id: s.id, name: varios ? `${nomeFunil.get(s.pipelineId) ?? ''} · ${s.name}` : s.name }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <AutomationsTab
        stages={stages}
        automations={automations as AutomationRow[]}
        tags={basics.tags.map((t) => ({ id: t.id, name: t.name }))}
        team={basics.team.map((u) => ({ id: u.id, name: u.name ?? 'Sem nome' }))}
        templates={templates}
      />
    </div>
  );
}
