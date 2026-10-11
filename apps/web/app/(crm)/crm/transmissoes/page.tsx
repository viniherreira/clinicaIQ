import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { requireCrm } from '@/crm/guard';
import { broadcastStats } from '@/crm/broadcasts';
import { formatDue } from '@/crm/format';
import { can } from '@/lib/permissions';
import { BROADCAST_STATUS, StatsGrid } from './_components/stats';

export const metadata = { title: 'Transmissões · ClinicaIQ' };

/** As transmissões da clínica, mais novas em cima, com os números de cada uma. */
export default async function TransmissoesPage() {
  const ctx = await requireCrm('crm');
  const list = await ctx.db.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, name: true, status: true, scheduledAt: true, startedAt: true, createdAt: true, template: { select: { name: true } } },
  });
  const stats = await Promise.all(list.map((b) => broadcastStats(ctx.db, b.id)));
  const pode = can(ctx.role, 'crm_config');

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold tracking-tight">Transmissões</h1>
          <p className="mt-1 text-sm text-muted-foreground">Uma mensagem para um grupo de leads. Quem respondeu SAIR não recebe.</p>
        </div>
        {pode && (
          <Link href="/crm/transmissoes/nova" className="btn-primary btn-md">
            <Plus className="h-4 w-4" aria-hidden="true" /> Nova transmissão
          </Link>
        )}
      </div>

      {list.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-center text-muted-foreground">
          <Megaphone className="h-10 w-10" aria-hidden="true" />
          <p className="text-sm">Nenhuma transmissão ainda.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {list.map((b, i) => {
            const st = BROADCAST_STATUS[b.status];
            const quando = b.status === 'SCHEDULED' && b.scheduledAt ? `agendada para ${formatDue(b.scheduledAt)}` : formatDue(b.startedAt ?? b.createdAt);
            return (
              <li key={b.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Link href={`/crm/transmissoes/${b.id}`} className="mr-auto font-medium hover:text-primary hover:underline">
                    {b.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{quando}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
                <StatsGrid s={stats[i]} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
