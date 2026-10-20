import { requireCrm } from '@/crm/guard';
import { DEFAULT_HOURS, EMPTY_AUDIENCE } from '@/crm/bot-engine';
import { readFlow } from '@/crm/flow-legacy';
import { triggerLabel } from '@/crm/flow-templates';
import { loadCrmBasics, stageOptions } from '@/crm/page-data';
import { CaptureRules } from '../../configuracoes/_components/capture-rules';
import { BotsList } from './_components/bots-list';

export const metadata = { title: 'Bots · DreamClin' };

/**
 * Os robôs de atendimento do WhatsApp (passos ligados, como o Salesbot do
 * Kommo — cada um abre no quadro) e a captação pela primeira mensagem.
 */
export default async function BotsPage() {
  const ctx = await requireCrm('crm_config');
  const [basics, bots, regras] = await Promise.all([
    loadCrmBasics(ctx),
    ctx.db.chatbotFlow.findMany({ orderBy: { createdAt: 'asc' } }),
    ctx.db.captureRule.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  const tags = basics.tags.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  const refs = { stages: stageOptions(basics.pipelines), tags };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <BotsList
        tags={tags}
        bots={bots.flatMap((b) => {
          const doc = readFlow(b.steps);
          if (!doc) return [];
          const tagsPut = [
            ...new Set(Object.values(doc.steps).flatMap((s) => (s.type === 'action' ? s.actions.flatMap((a) => (a.type === 'tag' && a.tagId ? [a.tagId] : [])) : []))),
          ];
          return [
            {
              id: b.id,
              name: b.name,
              trigger: b.trigger,
              triggerText: triggerLabel({ trigger: b.trigger, keywords: b.keywords }, doc, refs),
              active: b.active,
              steps: Object.keys(doc.steps).length,
              hours: doc.hours ?? DEFAULT_HOURS,
              audience: doc.audience ?? EMPTY_AUDIENCE,
              tagsPut,
            },
          ];
        })}
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
          tags={tags.map(({ id, name }) => ({ id, name }))}
          pipelines={basics.pipelines.map((p) => ({ id: p.id, name: p.name }))}
        />
      </BotsList>
    </div>
  );
}
