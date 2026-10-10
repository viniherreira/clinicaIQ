import { requireCrm } from '@/crm/guard';
import { INBOX_TABS, classifyPending, inboxCounts, listConversations, loadThread, markRead, type InboxTab } from '@/crm/conversations';
import { can } from '@/lib/permissions';
import { Inbox } from './_components/inbox';

export const metadata = { title: 'Conversas · ClinicaIQ' };

/** A caixa de conversas do WhatsApp, como os chats do Kommo: lista à esquerda, conversa à direita. */
export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm');
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const tab: InboxTab = (INBOX_TABS as readonly string[]).includes(one('aba')) ? (one('aba') as InboxTab) : 'all';
  const q = one('q').slice(0, 80);
  const selectedId = one('c') || null;

  // As que o aviso do gateway não alcançou.
  await classifyPending(ctx.db, ctx.tenantId);

  const [list, counts, thread, quickReplies, line] = await Promise.all([
    listConversations(ctx.db, ctx, tab, q),
    inboxCounts(ctx.db),
    selectedId ? loadThread(ctx.db, ctx.tenantId, selectedId) : Promise.resolve(null),
    ctx.db.quickReply.findMany({ orderBy: [{ order: 'asc' }, { title: 'asc' }], select: { id: true, title: true, body: true } }),
    ctx.db.whatsAppSession.findFirst({ select: { status: true } }),
  ]);
  if (thread && thread.conversation.unread > 0) {
    await markRead(ctx.db, thread.conversation.id);
    thread.conversation.unread = 0;
    const item = list.find((c) => c.id === thread.conversation.id);
    if (item) item.unread = 0;
  }

  return (
    <Inbox
      initial={{ list, counts, thread }}
      initialTab={tab}
      initialQ={q}
      initialSelectedId={thread ? selectedId : null}
      quickReplies={quickReplies}
      lineDown={line?.status !== 'CONNECTED'}
      canConfigWhatsapp={can(ctx.role, 'configuracoes')}
    />
  );
}
