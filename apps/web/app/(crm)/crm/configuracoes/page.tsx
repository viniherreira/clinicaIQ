import { requireCrm } from '@/crm/guard';
import { ensureDefaultPipeline } from '@/crm/pipeline';
import { listFieldDefs } from '@/crm/lead-fields';
import { getTenantModules } from '@/lib/access';
import { CrmSettings, type SettingsTab } from './_components/crm-settings';

export const metadata = { title: 'Configurações do CRM · DreamClin' };

const ABAS: readonly SettingsTab[] = ['funis', 'tags', 'campos', 'motivos', 'respostas'];

export default async function CrmConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm_config');
  await ensureDefaultPipeline(ctx.db, ctx.tenantId);
  const modules = await getTenantModules(ctx.tenantId);
  const sp = await searchParams;
  const aba = ABAS.find((a) => a === sp.aba) ?? 'funis';

  const [pipelines, porEtapa, tags, reasons, quickReplies, fields] = await Promise.all([
    ctx.db.pipeline.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { stages: { select: { id: true, name: true, role: true, order: true }, orderBy: { order: 'asc' } } },
    }),
    ctx.db.lead.groupBy({ by: ['stageId'], where: { tenantId: ctx.tenantId, deletedAt: null }, _count: { _all: true } }),
    ctx.db.leadTag.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { leads: true } } } }),
    ctx.db.lostReason.findMany({ orderBy: { order: 'asc' } }),
    ctx.db.quickReply.findMany({ orderBy: [{ order: 'asc' }, { title: 'asc' }], select: { id: true, title: true, body: true } }),
    listFieldDefs(ctx.db),
  ]);
  const leadsPorEtapa = new Map(porEtapa.map((r) => [r.stageId, r._count._all]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Configurações do CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">Funis, tags, campos, motivos de perda e respostas rápidas da clínica.</p>
      <CrmSettings
        initialTab={aba}
        pipelines={pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          stages: p.stages.length,
          leads: p.stages.reduce((s, x) => s + (leadsPorEtapa.get(x.id) ?? 0), 0),
          stageList: p.stages.map((x) => ({ id: x.id, name: x.name, role: x.role })),
        }))}
        agenda={modules.clinic}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color, leads: t._count.leads }))}
        reasons={reasons.map((r) => ({ id: r.id, name: r.name, active: r.active }))}
        quickReplies={quickReplies}
        fields={fields}
      />
    </div>
  );
}
