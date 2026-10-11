import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCrm } from '@/crm/guard';
import { activeCloudAccount } from '@/crm/cloud';
import { loadCrmBasics } from '@/crm/page-data';
import { BroadcastForm } from '../_components/broadcast-form';

export const metadata = { title: 'Nova transmissão · ClinicaIQ' };

export default async function NovaTransmissaoPage() {
  const ctx = await requireCrm('crm_config');
  const [basics, cloud, templates] = await Promise.all([
    loadCrmBasics(ctx),
    activeCloudAccount(ctx.tenantId),
    ctx.db.messageTemplate.findMany({
      where: { status: 'APPROVED', category: { in: ['MARKETING', 'UTILITY'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, body: true, variables: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href="/crm/transmissoes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Transmissões
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Nova transmissão</h1>
      <BroadcastForm
        stages={basics.columns.map((s) => ({ id: s.id, name: s.name }))}
        tags={basics.tags}
        team={basics.team}
        channel={cloud ? 'cloud' : 'gateway'}
        templates={templates}
      />
    </div>
  );
}
