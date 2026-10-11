import { requireCrm } from '@/crm/guard';
import { ensureDefaultPipeline } from '@/crm/pipeline';
import type { AutomationRow } from './_components/automations-tab';
import { CrmSettings } from './_components/crm-settings';

export const metadata = { title: 'Configurações do CRM · ClinicaIQ' };

export default async function CrmConfiguracoesPage() {
  const ctx = await requireCrm('crm_config');
  await ensureDefaultPipeline(ctx.db, ctx.tenantId);

  const [stages, tags, reasons, quickReplies, automations, team, templates] = await Promise.all([
    ctx.db.pipelineStage.findMany({ orderBy: { order: 'asc' }, include: { _count: { select: { leads: { where: { deletedAt: null } } } } } }),
    ctx.db.leadTag.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { leads: true } } } }),
    ctx.db.lostReason.findMany({ orderBy: { order: 'asc' } }),
    ctx.db.quickReply.findMany({ orderBy: [{ order: 'asc' }, { title: 'asc' }], select: { id: true, title: true, body: true } }),
    ctx.db.stageAutomation.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, stageId: true, action: true, config: true, delayMinutes: true, active: true },
    }),
    ctx.db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ctx.db.messageTemplate.findMany({ where: { status: 'APPROVED' }, orderBy: { name: 'asc' }, select: { id: true, name: true, variables: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Configurações do CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">Etapas do funil, automações, tags, motivos de perda e respostas rápidas da clínica.</p>
      <CrmSettings
        stages={stages.map((x) => ({ id: x.id, name: x.name, color: x.color, role: x.role, leads: x._count.leads }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color, leads: t._count.leads }))}
        reasons={reasons.map((r) => ({ id: r.id, name: r.name, active: r.active }))}
        quickReplies={quickReplies}
        automations={automations as AutomationRow[]}
        team={team.map((u) => ({ id: u.id, name: u.name ?? 'Sem nome' }))}
        templates={templates}
      />
    </div>
  );
}
