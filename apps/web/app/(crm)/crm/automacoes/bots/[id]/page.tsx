import { notFound } from 'next/navigation';
import { requireCrm } from '@/crm/guard';
import { readFlow } from '@/crm/flow-legacy';
import { blankFlow, FLOW_TEMPLATES } from '@/crm/flow-templates';
import { loadCrmBasics, stageOptions } from '@/crm/page-data';
import { FlowEditor, type FlowBotMeta } from '../_components/flow-editor';

export const metadata = { title: 'Robô · DreamClin' };

/**
 * O editor do robô em tela cheia, como o Salesbot do Kommo: o quadro de passos
 * ligados por setas, o painel do passo e o teste. `novo?modelo=` começa de um
 * modelo pronto.
 */
export default async function BotEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm_config');
  const { id } = await params;
  const sp = await searchParams;
  const [basics, outros] = await Promise.all([
    loadCrmBasics(ctx),
    ctx.db.chatbotFlow.findMany({ where: id === 'novo' ? {} : { id: { not: id } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  let meta: FlowBotMeta;
  let doc;
  if (id === 'novo') {
    const modelo = FLOW_TEMPLATES.find((t) => t.key === sp.modelo);
    meta = { id: null, name: modelo?.name ?? 'Meu robô', trigger: modelo?.trigger ?? 'KEYWORD', keywords: ['menu'], active: false };
    doc = modelo ? modelo.doc() : blankFlow();
  } else {
    const bot = await ctx.db.chatbotFlow.findFirst({ where: { id } });
    doc = bot ? readFlow(bot.steps) : null;
    if (!bot || !doc) notFound();
    meta = { id: bot.id, name: bot.name, trigger: bot.trigger, keywords: bot.keywords, active: bot.active };
  }

  return (
    // Tela cheia, por cima do menu do CRM: o quadro precisa de espaço.
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <FlowEditor
        meta={meta}
        doc={doc}
        refs={{
          stages: stageOptions(basics.pipelines),
          tags: basics.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
          team: basics.team.map((u) => ({ id: u.id, name: u.name ?? 'Sem nome' })),
          fields: basics.fields.map((f) => ({ id: f.id, name: f.name })),
          bots: outros,
        }}
      />
    </div>
  );
}
