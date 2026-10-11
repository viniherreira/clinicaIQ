import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCrm } from '@/crm/guard';
import { broadcastStats } from '@/crm/broadcasts';
import { formatDue } from '@/crm/format';
import { can } from '@/lib/permissions';
import { BROADCAST_STATUS, StatsGrid } from '../_components/stats';
import { AutoRefresh, CancelBroadcast } from '../_components/detail-controls';

export const metadata = { title: 'Transmissão · ClinicaIQ' };

const MSG_STATUS: Record<string, string> = {
  PENDING: 'Na fila',
  SENT: 'Enviada',
  DELIVERED: 'Entregue',
  READ: 'Lida',
  FAILED: 'Falhou',
};

type Recipient = {
  status: string;
  skipReason: string | null;
  chatMessage: { status: string; acceptedAt: Date | null; errorMessage: string | null; at: Date } | null;
};

function situacao(r: Recipient): string {
  const m = r.chatMessage;
  if (r.status === 'SKIPPED') return `Pulado: ${r.skipReason ?? 'sem motivo'}`;
  if (r.status === 'CANCELLED' || !m) return 'Cancelada';
  if (m.status === 'PENDING') return m.acceptedAt ? 'Enviada' : `Na fila · sai ${formatDue(m.at)}`;
  if (m.status === 'FAILED') return m.errorMessage ? `Falhou: ${m.errorMessage}` : 'Falhou';
  return MSG_STATUS[m.status] ?? m.status;
}

export default async function TransmissaoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrm('crm');
  const { id } = await params;
  const b = await ctx.db.broadcast.findFirst({ where: { id }, include: { template: { select: { name: true, body: true } } } });
  if (!b) notFound();
  const [stats, recips] = await Promise.all([
    broadcastStats(ctx.db, id),
    ctx.db.broadcastRecipient.findMany({
      where: { broadcastId: id },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        status: true,
        skipReason: true,
        lead: { select: { id: true, name: true } },
        chatMessage: { select: { status: true, acceptedAt: true, errorMessage: true, at: true } },
      },
    }),
  ]);
  const st = BROADCAST_STATUS[b.status];
  const ativa = b.status === 'SENDING' || b.status === 'SCHEDULED';
  const texto = b.text ?? b.template?.body ?? '';

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <AutoRefresh active={b.status === 'SENDING'} />
      <Link href="/crm/transmissoes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Transmissões
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">{b.name}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
        {ativa && can(ctx.role, 'crm_config') && <CancelBroadcast id={b.id} />}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {b.status === 'SCHEDULED' && b.scheduledAt ? `Agendada para ${formatDue(b.scheduledAt)}` : `Começou ${formatDue(b.startedAt ?? b.createdAt)}`}
        {b.template && ` · modelo ${b.template.name}`}
      </p>

      <div className="mt-4">
        <StatsGrid s={stats} />
      </div>

      <section aria-labelledby="bc-msg" className="mt-6">
        <h2 id="bc-msg" className="text-sm font-semibold">Mensagem</h2>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm">{texto}</p>
      </section>

      <section aria-labelledby="bc-quem" className="mt-6">
        <h2 id="bc-quem" className="text-sm font-semibold">Quem recebe ({recips.length})</h2>
        {recips.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {b.status === 'SCHEDULED' ? 'A lista sai quando a transmissão começar.' : 'Preparando a lista…'}
          </p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 font-medium">Lead</th>
                <th scope="col" className="py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {recips.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2">
                    <Link href={`/crm/leads/${r.lead.id}`} className="hover:text-primary hover:underline">
                      {r.lead.name}
                    </Link>
                  </td>
                  <td className={`py-2 ${r.chatMessage?.status === 'FAILED' ? 'text-destructive' : 'text-muted-foreground'}`}>{situacao(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
