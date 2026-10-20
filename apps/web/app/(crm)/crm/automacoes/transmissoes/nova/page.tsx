import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCrm } from '@/crm/guard';
import { activeCloudAccount } from '@/crm/cloud';
import { loadCrmBasics } from '@/crm/page-data';
import { tagCounts } from '@/crm/board-data';
import { audienceFromSearch } from '@/crm/audience';
import { clinicToday } from '@/lib/tz';
import { BroadcastForm } from '../_components/broadcast-form';

export const metadata = { title: 'Nova transmissão · DreamClin' };

/**
 * Nova transmissão. Vindo do funil ou da lista ("Enviar transmissão para estes
 * leads"), o público já chega com os filtros da busca.
 */
export default async function NovaTransmissaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm_config');
  const sp = await searchParams;
  const [basics, cloud, templates, counts] = await Promise.all([
    loadCrmBasics(ctx),
    activeCloudAccount(ctx.tenantId),
    ctx.db.messageTemplate.findMany({
      where: { status: 'APPROVED', category: { in: ['MARKETING', 'UTILITY'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, body: true, variables: true },
    }),
    tagCounts(ctx),
  ]);

  const today = clinicToday();
  // Veio da busca de leads ("Transmissão para estes leads")? Qualquer filtro na URL diz que sim.
  const daBusca = Object.keys(sp).some((k) => ['q', 'resp', 'tarefa', 'tag', 'origem', 'funil', 'etapa', 'periodo', 'de', 'ate', 'criado', 'vmin', 'vmax', 'situacao'].includes(k));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Link href="/crm/automacoes/transmissoes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Transmissões
      </Link>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">Nova transmissão</h2>
      <BroadcastForm
        today={today}
        fromSearch={daBusca}
        initialAudience={audienceFromSearch(sp, today, ctx.userId)}
        pipelines={basics.pipelines.map((p) => ({ id: p.id, name: p.name, stages: p.columns.map((s) => ({ id: s.id, name: s.name })) }))}
        tags={basics.tags.map((t) => ({ id: t.id, name: t.name, color: t.color, count: counts.get(t.id) ?? 0 }))}
        team={basics.team}
        channel={cloud ? 'cloud' : 'gateway'}
        templates={templates}
      />
    </div>
  );
}
