'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, MessageCircle, StickyNote } from 'lucide-react';
import type { ChatThread } from '@/crm/conversations';
import type { LeadDetail } from '@/crm/lead-detail';
import type { BoardPerson } from '@/crm/types';
import { ChatComposer, type QuickReplyOption } from '@/components/crm-chat/chat-composer';
import { ChatMessages } from '@/components/crm-chat/chat-messages';
import { ComposerModes, type ComposerMode } from '@/components/crm-chat/composer-modes';
import { ConversationPane } from '@/components/crm-chat/conversation-pane';
import { TemplatePicker } from '@/components/crm-chat/template-picker';
import { loadThreadAction, startLeadChatAction } from '@/app/(crm)/crm/conversas/actions';
import { NoteTaskForm, PendingTasks } from './lead-feed';

const POLL_MS = 4_000;

/**
 * A metade direita da ficha, como no Kommo: as tarefas pendentes em cima, a
 * conversa do WhatsApp com o histórico no meio (mudou de etapa, notas,
 * tarefas, agenda), e embaixo Bate-papo, Nota ou Tarefa.
 */
export function LeadRightPane({
  lead,
  team,
  meId,
  initialThread,
  quickReplies,
  channel,
  canManage,
}: {
  lead: LeadDetail;
  team: BoardPerson[];
  meId: string;
  initialThread: ChatThread | null;
  quickReplies: QuickReplyOption[];
  channel: 'cloud' | 'gateway';
  canManage: boolean;
}) {
  const [thread, setThread] = useState(initialThread);
  const [conversationId, setConversationId] = useState(initialThread?.conversation.id ?? null);
  const emVoo = useRef(false);

  const refresh = useCallback(async () => {
    if (!conversationId || emVoo.current) return;
    emVoo.current = true;
    try {
      const r = await loadThreadAction(conversationId);
      if (r.ok && r.thread) setThread(r.thread);
    } finally {
      emVoo.current = false;
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => document.visibilityState === 'visible' && void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const form = { leadId: lead.id, team, meId, assignedToId: lead.assignedToId, noTask: lead.task.kind === 'none' };
  const extras: ComposerMode[] = [
    { key: 'nota', label: 'Nota', icon: StickyNote, content: <NoteTaskForm mode="nota" {...form} /> },
    { key: 'tarefa', label: 'Tarefa', icon: CheckCircle2, content: <NoteTaskForm mode="tarefa" {...form} /> },
  ];

  return (
    <section aria-label="Conversa e histórico" className="flex min-h-0 flex-1 flex-col">
      <PendingTasks lead={lead} />
      {thread ? (
        <ConversationPane
          thread={thread}
          quickReplies={quickReplies}
          onChanged={() => void refresh()}
          compact
          canManage={canManage}
          events={lead.timeline}
          extraModes={extras}
        />
      ) : (
        <>
          <ChatMessages messages={[]} truncated={false} contactName={lead.name} events={lead.timeline} />
          <ComposerModes
            modes={[
              {
                key: 'chat',
                label: 'Bate-papo',
                icon: MessageCircle,
                content: (
                  <StartChat
                    leadId={lead.id}
                    leadName={lead.name}
                    quickReplies={quickReplies}
                    channel={channel}
                    canManage={canManage}
                    onStarted={setConversationId}
                  />
                ),
              },
              ...extras,
            ]}
          />
        </>
      )}
    </section>
  );
}

/** Ainda sem conversa: a primeira mensagem (na API oficial, um modelo aprovado). */
function StartChat({
  leadId,
  leadName,
  quickReplies,
  channel,
  canManage,
  onStarted,
}: {
  leadId: string;
  leadName: string;
  quickReplies: QuickReplyOption[];
  channel: 'cloud' | 'gateway';
  canManage: boolean;
  onStarted: (conversationId: string) => void;
}) {
  return (
    <div>
      <p className="px-4 pt-2 text-xs text-muted-foreground">
        Ainda não há conversa com {leadName} no WhatsApp da clínica.{' '}
        {channel === 'cloud' ? 'Na API oficial, a primeira mensagem precisa ser um modelo aprovado.' : 'A mensagem sai pelo número da clínica.'}
      </p>
      {channel === 'cloud' ? (
        <TemplatePicker target={{ leadId }} contactName={leadName} canManage={canManage} onSent={onStarted} />
      ) : (
        <ChatComposer
          quickReplies={quickReplies}
          contactName={leadName}
          onSend={async (text) => {
            const r = await startLeadChatAction(leadId, text);
            if (!r.ok) return r;
            onStarted(r.conversationId);
            return { ok: true as const };
          }}
        />
      )}
    </div>
  );
}
