'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { guardCrmAction } from '@/crm/guard';
import { dispatchChat } from '@/crm/chat-dispatch';
import {
  INBOX_TABS,
  acceptConversation,
  declineConversation,
  ensureConversationForLead,
  inboxCounts,
  linkConversation,
  listConversations,
  loadThread,
  markRead,
  retryChatMessage,
  writeChatMessage,
  type ChatThread,
  type ConversationSummary,
  type InboxTab,
} from '@/crm/conversations';
import { OPEN_LEAD } from '@/crm/leads';

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export interface InboxSnapshot {
  list: ConversationSummary[];
  counts: { unread: number; inbox: number };
  thread: ChatThread | null;
}

const asTab = (t: string): InboxTab => ((INBOX_TABS as readonly string[]).includes(t) ? (t as InboxTab) : 'all');

/**
 * O que a tela de Conversas mostra agora. Chamada a cada poucos segundos
 * enquanto a tela está aberta; quem está com uma conversa aberta a lê.
 */
export async function refreshInboxAction(input: { tab: string; q: string; selectedId: string | null }): Promise<Result<{ snapshot: InboxSnapshot }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  const [list, counts, thread] = await Promise.all([
    listConversations(g.db, g, asTab(input.tab), input.q),
    inboxCounts(g.db),
    input.selectedId ? loadThread(g.db, g.tenantId, input.selectedId) : Promise.resolve(null),
  ]);
  if (thread && thread.conversation.unread > 0) {
    await markRead(g.db, thread.conversation.id);
    thread.conversation.unread = 0;
    const item = list.find((c) => c.id === thread.conversation.id);
    if (item) item.unread = 0;
  }
  return { ok: true, snapshot: { list, counts, thread } };
}

/** Só a conversa (a aba Conversa da ficha do lead). */
export async function loadThreadAction(conversationId: string): Promise<Result<{ thread: ChatThread | null }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  const thread = await loadThread(g.db, g.tenantId, conversationId);
  if (thread && thread.conversation.unread > 0) {
    await markRead(g.db, conversationId);
    thread.conversation.unread = 0;
  }
  return { ok: true, thread };
}

export async function sendChatAction(conversationId: string, text: string): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await writeChatMessage(g.db, g, conversationId, text);
  if (!r.ok) return r;
  // Responde já; a entrega ao WhatsApp segue depois.
  after(() => dispatchChat(g.tenantId, r.messageId));
  return { ok: true };
}

export async function retryChatAction(chatMessageId: string): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await retryChatMessage(g.db, chatMessageId);
  if (r.ok) after(() => dispatchChat(g.tenantId, chatMessageId));
  return r;
}

/** Escrever a um lead que ainda não tem conversa: cria a conversa e manda. */
export async function startLeadChatAction(leadId: string, text: string): Promise<Result<{ conversationId: string }>> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const conv = await ensureConversationForLead(g.db, g.tenantId, leadId);
  if (!conv.ok) return conv;
  const r = await writeChatMessage(g.db, g, conv.conversationId, text);
  if (!r.ok) return r;
  after(() => dispatchChat(g.tenantId, r.messageId));
  return { ok: true, conversationId: conv.conversationId };
}

export async function acceptConversationAction(conversationId: string): Promise<Result<{ leadId: string }>> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await acceptConversation(g.db, g, conversationId);
  if (r.ok) revalidatePath('/crm');
  return r;
}

export async function declineConversationAction(conversationId: string): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await declineConversation(g.db, conversationId);
  if (r.ok) revalidatePath('/crm');
  return r;
}

export async function linkConversationAction(
  conversationId: string,
  target: { leadId: string } | { patientId: string },
): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await linkConversation(g.db, conversationId, target);
  if (r.ok) revalidatePath('/crm');
  return r;
}

export interface LinkTarget {
  kind: 'lead' | 'patient';
  id: string;
  label: string;
  detail: string;
}

/** Para "Ligar a…": leads abertos e pacientes pelo nome. */
export async function searchLinkTargetsAction(q: string): Promise<Result<{ targets: LinkTarget[] }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return { ok: true, targets: [] };
  const [leads, patients] = await Promise.all([
    g.db.lead.findMany({
      where: { ...OPEN_LEAD, OR: [{ name: { contains: term, mode: 'insensitive' } }, { title: { contains: term, mode: 'insensitive' } }] },
      select: { id: true, name: true, title: true, stage: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    g.db.patient.findMany({
      where: { deletedAt: null, name: { contains: term, mode: 'insensitive' } },
      select: { id: true, name: true, controlNumber: true },
      orderBy: { name: 'asc' },
      take: 6,
    }),
  ]);
  return {
    ok: true,
    targets: [
      ...leads.map((l) => ({ kind: 'lead' as const, id: l.id, label: l.title ? `${l.title} — ${l.name}` : l.name, detail: `Lead · ${l.stage.name}` })),
      ...patients.map((p) => ({ kind: 'patient' as const, id: p.id, label: p.name, detail: `Paciente nº ${p.controlNumber}` })),
    ],
  };
}
