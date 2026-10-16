import { requireCrm } from '@/crm/guard';
import { loadCrmBasics, stageOptions } from '@/crm/page-data';
import { DEFAULT_HOURS, parseSteps } from '@/crm/bot-engine';
import { fromSteps } from '@/crm/bot-form';
import { BotsTab } from '../../configuracoes/_components/bots-tab';
import { CaptureRules } from '../../configuracoes/_components/capture-rules';

export const metadata = { title: 'Bots · DreamClin' };

/**
 * Os robôs de atendimento do WhatsApp (menu de opções, palavra-chave e o que
 * fazer em cada resposta) e a captação pela primeira mensagem.
 */
export default async function BotsPage() {
  const ctx = await requireCrm('crm_config');
  const [basics, bots, regras] = await Promise.all([
    loadCrmBasics(ctx),
    ctx.db.chatbotFlow.findMany({ orderBy: { createdAt: 'asc' } }),
    ctx.db.captureRule.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  const tags = basics.tags.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <BotsTab
          bots={bots.flatMap((b) => {
            const steps = parseSteps(b.steps);
            return steps
              ? [{ id: b.id, name: b.name, trigger: b.trigger, keywords: b.keywords, active: b.active, menu: fromSteps(steps), hours: steps.hours ?? DEFAULT_HOURS }]
              : [];
          })}
          stages={stageOptions(basics.pipelines)}
          tags={tags}
          team={basics.team.map((u) => ({ id: u.id, name: u.name ?? 'Sem nome' }))}
          fields={basics.fields.map((f) => ({ id: f.id, name: f.name }))}
        >
          <CaptureRules
            rules={regras.map((r) => ({
              id: r.id,
              name: r.name,
              keywords: r.keywords,
              tagIds: r.tagIds,
              pipelineId: r.pipelineId,
              source: r.source,
              active: r.active,
            }))}
            tags={tags}
            pipelines={basics.pipelines.map((p) => ({ id: p.id, name: p.name }))}
          />
        </BotsTab>
      </div>
    </div>
  );
}
