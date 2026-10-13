import { requireCrm } from '@/crm/guard';
import { loadCrmBasics, stageOptions } from '@/crm/page-data';
import { parseSteps } from '@/crm/bot-engine';
import { fromSteps } from '@/crm/bot-form';
import { BotsTab } from '../../configuracoes/_components/bots-tab';

export const metadata = { title: 'Bots · ClinicaIQ' };

/** Os robôs de atendimento do WhatsApp: menu de opções, palavra-chave e o que fazer em cada resposta. */
export default async function BotsPage() {
  const ctx = await requireCrm('crm_config');
  const [basics, bots] = await Promise.all([
    loadCrmBasics(ctx),
    ctx.db.chatbotFlow.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div>
        <BotsTab
          bots={bots.flatMap((b) => {
            const steps = parseSteps(b.steps);
            return steps ? [{ id: b.id, name: b.name, trigger: b.trigger, keywords: b.keywords, active: b.active, menu: fromSteps(steps) }] : [];
          })}
          stages={stageOptions(basics.pipelines)}
          tags={basics.tags.map((t) => ({ id: t.id, name: t.name }))}
          team={basics.team.map((u) => ({ id: u.id, name: u.name ?? 'Sem nome' }))}
        />
      </div>
    </div>
  );
}
