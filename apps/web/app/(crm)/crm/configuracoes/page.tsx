import { requireCrm } from '@/crm/guard';
import { ensureDefaultPipeline } from '@/crm/pipeline';
import { CrmSettings, type SettingsTab } from './_components/crm-settings';

export const metadata = { title: 'Configurações do CRM · ClinicaIQ' };

const ABAS: readonly SettingsTab[] = ['funis', 'tags', 'motivos', 'respostas'];

export default async function CrmConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm_config');
  await ensureDefaultPipeline(ctx.db, ctx.tenantId);
  const sp = await searchParams;
  const aba = ABAS.find((a) => a === sp.aba) ?? 'funis';

  const [pipelines, porEtapa, tags, reasons, quickReplies] = await Promise.all([
    ctx.db.pipeline.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { stages: { select: { id: true } } },
    }),
    ctx.db.lead.groupBy({ by: ['stageId'], where: { tenantId: ctx.tenantId, deletedAt: null }, _count: { _all: true } }),
    ctx.db.leadTag.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { leads: true } } } }),
    ctx.db.lostReason.findMany({ orderBy: { order: 'asc' } }),
    ctx.db.quickReply.findMany({ orderBy: [{ order: 'asc' }, { title: 'asc' }], select: { id: true, title: true, body: true } }),
  ]);
  const leadsPorEtapa = new Map(porEtapa.map((r) => [r.stageId, r._count._all]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Configurações do CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">Funis, tags, motivos de perda e respostas rápidas da clínica.</p>
      <CrmSettings
        initialTab={aba}
        pipelines={pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          stages: p.stages.length,
          leads: p.stages.reduce((s, x) => s + (leadsPorEtapa.get(x.id) ?? 0), 0),
        }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color, leads: t._count.leads }))}
        reasons={reasons.map((r) => ({ id: r.id, name: r.name, active: r.active }))}
        quickReplies={quickReplies}
      />
    </div>
  );
}
