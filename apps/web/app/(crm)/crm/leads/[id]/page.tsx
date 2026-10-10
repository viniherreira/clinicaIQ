import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCrm } from '@/crm/guard';
import { loadLeadDetail } from '@/crm/lead-detail';
import { loadCrmBasics } from '@/crm/page-data';
import { conversationIdForLead, loadThread } from '@/crm/conversations';
import { LeadFeed } from './_components/lead-feed';
import { LeadPanel } from './_components/lead-panel';
import { ConvertActions } from './_components/convert-actions';
import { LeadRightPane } from './_components/lead-chat';

export async function generateMetadata() {
  return { title: 'Lead · ClinicaIQ' };
}

/** A ficha do lead, em duas metades: dados à esquerda; histórico e conversa à direita. */
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrm('crm');
  const { id } = await params;
  const [lead, basics, conversationId, quickReplies] = await Promise.all([
    loadLeadDetail(ctx, id),
    loadCrmBasics(ctx),
    conversationIdForLead(ctx.db, ctx.tenantId, id),
    ctx.db.quickReply.findMany({ orderBy: [{ order: 'asc' }, { title: 'asc' }], select: { id: true, title: true, body: true } }),
  ]);
  if (!lead) notFound();
  const thread = conversationId ? await loadThread(ctx.db, ctx.tenantId, conversationId) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-2.5">
        <Link href="/crm" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Funil
        </Link>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="overflow-y-auto">
          <LeadPanel
            lead={lead}
            stages={basics.columns}
            closedStages={basics.closedStages}
            allTags={basics.tags}
            team={basics.team}
            procedures={basics.procedures}
            lostReasons={basics.lostReasons}
            actions={<ConvertActions key="converter" leadId={lead.id} patient={lead.patient} />}
          />
        </div>
        <LeadRightPane
          feed={<LeadFeed lead={lead} team={basics.team} meId={ctx.userId} />}
          leadId={lead.id}
          leadName={lead.name}
          initialThread={thread}
          quickReplies={quickReplies}
        />
      </div>
    </div>
  );
}
