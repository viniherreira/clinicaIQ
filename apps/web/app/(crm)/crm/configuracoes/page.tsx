import { requireCrm } from '@/crm/guard';
import { ensureDefaultPipeline } from '@/crm/pipeline';
import { CrmSettings } from './_components/crm-settings';

export const metadata = { title: 'Configurações do CRM · ClinicaIQ' };

export default async function CrmConfiguracoesPage() {
  const ctx = await requireCrm('crm_config');
  await ensureDefaultPipeline(ctx.db, ctx.tenantId);

  const [stages, tags, reasons] = await Promise.all([
    ctx.db.pipelineStage.findMany({ orderBy: { order: 'asc' }, include: { _count: { select: { leads: { where: { deletedAt: null } } } } } }),
    ctx.db.leadTag.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { leads: true } } } }),
    ctx.db.lostReason.findMany({ orderBy: { order: 'asc' } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Configurações do CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">Etapas do funil, tags e motivos de perda da clínica.</p>
      <CrmSettings
        stages={stages.map((x) => ({ id: x.id, name: x.name, color: x.color, role: x.role, leads: x._count.leads }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color, leads: t._count.leads }))}
        reasons={reasons.map((r) => ({ id: r.id, name: r.name, active: r.active }))}
      />
    </div>
  );
}
