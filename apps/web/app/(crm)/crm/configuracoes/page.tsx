import Link from 'next/link';
import { prisma } from '@clinicaiq/db';
import { requireCrm } from '@/crm/guard';
import { ensureDefaultPipeline } from '@/crm/pipeline';
import { listFieldDefs } from '@/crm/lead-fields';
import { loadTeam } from '@/crm/team';
import { loadCrmAddon } from '@/crm/addon';
import { readCrmPrefs } from '@/crm/crm-prefs';
import { formatCents } from '@/crm/format';
import { getTenantModules } from '@/lib/access';
import { can } from '@/lib/permissions';
import { CRM_ROLE_INFO } from '@/lib/crm-roles';
import { presetOf } from '@/lib/crm-rights';
import { SettingsLayout, type SettingsSection } from '@/app/(app)/configuracoes/_components/settings-layout';
import { CrmSettings, type SettingsTab } from './_components/crm-settings';
import { ChatSection, GeneralSection, ProfileSection } from './_components/prefs-sections';
import { DistributionSection, TeamSection } from './_components/team-section';

export const metadata = { title: 'Configurações do CRM · DreamClin' };

const PERFIL: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
  PROFESSIONAL: 'Profissional',
};

/**
 * As Configurações do CRM, organizadas como as do Kommo: menu lateral com
 * Perfil, Área de trabalho e Integrações. Quem não é gestor vê só o próprio
 * perfil; o resto é de quem configura o CRM.
 *
 * `?aba=tags` (os links antigos) e `#tags` abrem a seção direto.
 */
export default async function CrmConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm');
  const sp = await searchParams;
  const aba = typeof sp.aba === 'string' ? sp.aba : undefined;

  const eu = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true, role: true, crmAvailable: true, crmReceivesLeads: true },
  });
  const perfil: SettingsSection = {
    id: 'perfil',
    group: 'Perfil',
    label: 'Meu perfil',
    panel: (
      <ProfileSection
        name={eu?.name ?? ''}
        email={eu?.email ?? ''}
        roleLabel={PERFIL[eu?.role ?? ''] ?? '-'}
        cargo={presetOf(ctx.rights) ? CRM_ROLE_INFO[ctx.crmRole].label : 'Personalizado'}
        rights={ctx.rights}
        available={eu?.crmAvailable ?? true}
        receivesLeads={eu?.crmReceivesLeads ?? true}
      />
    ),
  };

  if (!ctx.manager) {
    return (
      <Moldura>
        <SettingsLayout sections={[perfil]} />
      </Moldura>
    );
  }

  await ensureDefaultPipeline(ctx.db, ctx.tenantId, ctx.agenda);
  const [modules, pipelines, porEtapa, tags, reasons, quickReplies, fields, team, addon, tenant] = await Promise.all([
    getTenantModules(ctx.tenantId),
    ctx.db.pipeline.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { stages: { select: { id: true, name: true, role: true, order: true }, orderBy: { order: 'asc' } } },
    }),
    ctx.db.lead.groupBy({ by: ['stageId'], where: { tenantId: ctx.tenantId, deletedAt: null }, _count: { _all: true } }),
    ctx.db.leadTag.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { leads: true } } } }),
    ctx.db.lostReason.findMany({ orderBy: { order: 'asc' } }),
    ctx.db.quickReply.findMany({ orderBy: [{ order: 'asc' }, { title: 'asc' }], select: { id: true, title: true, body: true } }),
    listFieldDefs(ctx.db),
    loadTeam(ctx.tenantId),
    loadCrmAddon(ctx.tenantId),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { settings: true } }),
  ]);
  const leadsPorEtapa = new Map(porEtapa.map((r) => [r.stageId, r._count._all]));
  const prefs = readCrmPrefs(tenant?.settings);

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

  const dados = {
    pipelines: pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      stages: p.stages.length,
      leads: p.stages.reduce((s, x) => s + (leadsPorEtapa.get(x.id) ?? 0), 0),
      stageList: p.stages.map((x) => ({ id: x.id, name: x.name, role: x.role })),
    })),
    agenda: modules.clinic,
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color, leads: t._count.leads })),
    reasons: reasons.map((r) => ({ id: r.id, name: r.name, active: r.active })),
    quickReplies,
    fields,
  };
  const antiga = (tab: SettingsTab) => <CrmSettings key={tab} {...dados} initialTab={tab} bare />;

  const sections: SettingsSection[] = [
    perfil,
    { id: 'geral', group: 'Área de trabalho', label: 'Geral', panel: <GeneralSection initial={prefs} /> },
    { id: 'conversas', group: 'Área de trabalho', label: 'Conversas', panel: <ChatSection initial={prefs} /> },
    {
      id: 'equipe',
      group: 'Área de trabalho',
      label: 'Equipe e permissões',
      aliases: ['usuarios'],
      badge: team.members.filter((m) => m.member).length,
      panel: <TeamSection members={team.members} meId={ctx.userId} seats={seats} wholeTeam={addon.status === 'complimentary'} />,
    },
    {
      id: 'distribuicao',
      group: 'Área de trabalho',
      label: 'Distribuição de leads',
      panel: <DistributionSection initial={team.distribution} unassigned={team.unassigned} members={team.members} />,
    },
    { id: 'funis', group: 'Funil', label: 'Funis e etapas', panel: antiga('funis') },
    { id: 'campos', group: 'Funil', label: 'Campos', panel: antiga('campos') },
    { id: 'tags', group: 'Funil', label: 'Tags', panel: antiga('tags') },
    { id: 'motivos', group: 'Funil', label: 'Motivos de perda', panel: antiga('motivos') },
    { id: 'respostas', group: 'Comunicação', label: 'Respostas rápidas', panel: antiga('respostas') },
    {
      id: 'whatsapp',
      group: 'Integrações e canais',
      label: 'WhatsApp',
      panel: (
        <Atalho
          title="WhatsApp oficial"
          description="O número da clínica conectado pela API oficial da Meta, a janela de 24 horas e os modelos aprovados."
          href="/crm/whatsapp"
          cta="Abrir WhatsApp"
        />
      ),
    },
    {
      id: 'automacoes',
      group: 'Integrações e canais',
      label: 'Automações',
      panel: (
        <Atalho
          title="Automações"
          description="Robôs, automações por etapa do funil, modelos da Meta e transmissões."
          href="/crm/automacoes"
          cta="Abrir automações"
        />
      ),
    },
  ];

  return (
    <Moldura>
      <SettingsLayout sections={sections} initial={aba ?? 'equipe'} />
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-board">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Configurações do CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">Perfil, equipe e permissões, distribuição, funis e o resto do CRM, num lugar só.</p>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Aponta para uma tela que já existe, em vez de duplicá-la aqui. */
function Atalho({ title, description, href, cta }: { title: string; description: string; href: string; cta: string }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      <Link href={href} className="btn-primary btn-sm mt-4 inline-flex">
        {cta}
      </Link>
    </section>
  );
}
