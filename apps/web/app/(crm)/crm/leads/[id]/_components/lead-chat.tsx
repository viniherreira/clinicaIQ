'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { History, MessageCircle } from 'lucide-react';
import type { ChatThread } from '@/crm/conversations';
import { ChatComposer, type QuickReplyOption } from '@/components/crm-chat/chat-composer';
import { ConversationPane } from '@/components/crm-chat/conversation-pane';
import { loadThreadAction, startLeadChatAction } from '@/app/(crm)/crm/conversas/actions';

const POLL_MS = 4_000;

/**
 * A metade direita da ficha em duas abas: Histórico (tarefas, notas, o que
 * aconteceu) e Conversa (o WhatsApp com a pessoa).
 */
export function LeadRightPane({
  feed,
  leadId,
  leadName,
  initialThread,
  quickReplies,
}: {
  feed: React.ReactNode;
  leadId: string;
  leadName: string;
  initialThread: ChatThread | null;
  quickReplies: QuickReplyOption[];
}) {
  const id = useId();
  const [aba, setAba] = useState<'historico' | 'conversa'>('historico');
  const naoLidas = initialThread?.conversation.unread ?? 0;
  const abas = [
    { key: 'historico' as const, label: 'Histórico', icon: History },
    { key: 'conversa' as const, label: 'Conversa', icon: MessageCircle },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Ficha do lead" className="flex gap-5 border-b border-border px-5 text-sm">
        {abas.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            id={`${id}-${a.key}`}
            aria-selected={aba === a.key}
            aria-controls={`${id}-painel-${a.key}`}
            tabIndex={aba === a.key ? 0 : -1}
            onClick={() => setAba(a.key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const outra = a.key === 'historico' ? 'conversa' : 'historico';
                setAba(outra);
                document.getElementById(`${id}-${outra}`)?.focus();
              }
            }}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 py-2.5 focus-visible:outline-2 focus-visible:outline-ring ${aba === a.key ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <a.icon className="h-4 w-4" aria-hidden="true" /> {a.label}
            {a.key === 'conversa' && naoLidas > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {naoLidas}
                <span className="sr-only"> não lida(s)</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <div id={`${id}-painel-historico`} role="tabpanel" aria-labelledby={`${id}-historico`} hidden={aba !== 'historico'} className={`${aba === 'historico' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
        {feed}
      </div>
      <div id={`${id}-painel-conversa`} role="tabpanel" aria-labelledby={`${id}-conversa`} hidden={aba !== 'conversa'} className={`${aba === 'conversa' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
        {aba === 'conversa' && <LeadChat leadId={leadId} leadName={leadName} initialThread={initialThread} quickReplies={quickReplies} />}
      </div>
    </div>
  );
}

function LeadChat({
  leadId,
  leadName,
  initialThread,
  quickReplies,
}: {
  leadId: string;
  leadName: string;
  initialThread: ChatThread | null;
  quickReplies: QuickReplyOption[];
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

  if (thread) return <ConversationPane thread={thread} quickReplies={quickReplies} onChanged={() => void refresh()} compact />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <MessageCircle className="h-10 w-10" aria-hidden="true" />
        <p className="text-sm">Ainda não há conversa com {leadName} no WhatsApp da clínica.</p>
        <p className="text-xs">Escreva abaixo para começar. A mensagem sai pelo número da clínica.</p>
      </div>
      <ChatComposer
        quickReplies={quickReplies}
        contactName={leadName}
        onSend={async (text) => {
          const r = await startLeadChatAction(leadId, text);
          if (!r.ok) return r;
          setConversationId(r.conversationId);
          return { ok: true as const };
        }}
      />
    </div>
  );
}
