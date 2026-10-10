'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, Search, WifiOff } from 'lucide-react';
import type { ConversationSummary, InboxTab } from '@/crm/conversations';
import { chatListTime, initials } from '@/crm/format';
import { ConversationPane } from '@/components/crm-chat/conversation-pane';
import type { QuickReplyOption } from '@/components/crm-chat/chat-composer';
import { refreshInboxAction, type InboxSnapshot } from '../actions';

const TABS: { key: InboxTab; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'mine', label: 'Minhas' },
  { key: 'unanswered', label: 'Sem resposta' },
  { key: 'inbox', label: 'Entrada' },
];

/** De quanto em quanto tempo a tela pergunta se chegou algo, enquanto visível. */
const POLL_MS = 4_000;

export function Inbox({
  initial,
  initialTab,
  initialQ,
  initialSelectedId,
  quickReplies,
  lineDown,
  canConfigWhatsapp,
}: {
  initial: InboxSnapshot;
  initialTab: InboxTab;
  initialQ: string;
  initialSelectedId: string | null;
  quickReplies: QuickReplyOption[];
  lineDown: boolean;
  canConfigWhatsapp: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [snap, setSnap] = useState(initial);
  const [tab, setTab] = useState(initialTab);
  const [busca, setBusca] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [aviso, setAviso] = useState('');
  const emVoo = useRef(false);
  const estado = useRef({ tab, q, selectedId });
  estado.current = { tab, q, selectedId };
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const refresh = useCallback(async () => {
    if (emVoo.current) return;
    emVoo.current = true;
    try {
      const pedido = { ...estado.current };
      const r = await refreshInboxAction(pedido);
      // Se a pessoa trocou de aba ou de conversa no meio, esta resposta já é velha.
      const agora = estado.current;
      if (!r.ok || pedido.tab !== agora.tab || pedido.q !== agora.q || pedido.selectedId !== agora.selectedId) return;
      const novas = novasRecebidas(snapRef.current, r.snapshot);
      if (novas) setAviso(novas);
      // O número do menu vem do servidor: muda junto quando as não lidas mudam.
      if (r.snapshot.counts.unread !== snapRef.current.counts.unread) router.refresh();
      setSnap(r.snapshot);
    } finally {
      emVoo.current = false;
    }
  }, [router]);

  // Filtros e conversa aberta moram na URL (sem recarregar a página).
  useEffect(() => {
    const sp = new URLSearchParams();
    if (tab !== 'all') sp.set('aba', tab);
    if (q) sp.set('q', q);
    if (selectedId) sp.set('c', selectedId);
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `/crm/conversas?${qs}` : '/crm/conversas');
  }, [tab, q, selectedId]);

  // A primeira leitura já veio do servidor; daí em diante, a cada mudança.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    void refresh();
  }, [tab, q, selectedId, refresh]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (busca === q) return;
    const t = setTimeout(() => setQ(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca, q]);

  const thread = snap.thread && snap.thread.conversation.id === selectedId ? snap.thread : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {lineDown && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>O WhatsApp da clínica não está conectado. As respostas ficam na fila e saem quando ele voltar.</span>
          {canConfigWhatsapp && (
            <Link href="/whatsapp" className="font-medium underline underline-offset-2">
              Conectar
            </Link>
          )}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <aside aria-labelledby={`${id}-titulo`} className={`${selectedId ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-border bg-surface`}>
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-baseline justify-between">
              <h1 id={`${id}-titulo`} className="text-lg font-semibold">
                Conversas
              </h1>
              {snap.counts.unread > 0 && <span className="text-xs text-muted-foreground">{snap.counts.unread} não lida(s)</span>}
            </div>
            <div className="relative">
              <label htmlFor={`${id}-busca`} className="sr-only">
                Buscar conversa
              </label>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id={`${id}-busca`}
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome ou telefone"
                className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
            <div role="group" aria-label="Filtrar conversas" className="segmented flex w-full">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className="segmented-item flex-1 whitespace-nowrap px-2"
                >
                  {t.label}
                  {t.key === 'inbox' && snap.counts.inbox > 0 && (
                    <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                      {snap.counts.inbox}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <ConversationList items={snap.list} selectedId={selectedId} onSelect={setSelectedId} tab={tab} q={q} />
        </aside>

        <div className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col`}>
          {thread ? (
            <ConversationPane
              key={thread.conversation.id}
              thread={thread}
              quickReplies={quickReplies}
              onChanged={() => void refresh()}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <MessageCircle className="h-10 w-10" aria-hidden="true" />
              <p className="text-sm">{selectedId ? 'Carregando conversa…' : 'Escolha uma conversa na lista.'}</p>
            </div>
          )}
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </div>
  );
}

/** "Nova mensagem de Ana" quando a conversa aberta recebe algo. */
function novasRecebidas(antes: InboxSnapshot, depois: InboxSnapshot): string {
  const a = antes.thread;
  const d = depois.thread;
  if (!a || !d || a.conversation.id !== d.conversation.id) return '';
  const vistos = new Set(a.messages.map((m) => m.id));
  const novas = d.messages.filter((m) => !vistos.has(m.id) && m.direction === 'INBOUND');
  if (novas.length === 0) return '';
  const ultima = novas.at(-1)!;
  return `Nova mensagem de ${d.conversation.name}: ${ultima.text || 'mídia'}`;
}

function ConversationList({
  items,
  selectedId,
  onSelect,
  tab,
  q,
}: {
  items: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tab: InboxTab;
  q: string;
}) {
  if (items.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        {q
          ? 'Nenhuma conversa encontrada.'
          : tab === 'inbox'
            ? 'Ninguém novo na Entrada.'
            : tab === 'unanswered'
              ? 'Nenhuma conversa esperando resposta.'
              : tab === 'mine'
                ? 'Nenhuma conversa de leads seus.'
                : 'Ainda não há conversas. Elas aparecem aqui assim que alguém escrever para o WhatsApp da clínica.'}
      </p>
    );
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Lista de conversas">
      {items.map((c) => {
        const ativa = c.id === selectedId;
        const entrada = c.status === 'INBOX';
        const lida = c.unread === 0;
        return (
          <li key={c.id} className="border-b border-border/70">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              aria-current={ativa ? 'true' : undefined}
              className={`flex w-full gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${ativa ? 'bg-primary/10' : 'hover:bg-surface-alt'}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${entrada ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' : 'bg-primary/10 text-primary'}`}
              >
                {initials(c.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={`truncate text-sm ${lida ? 'font-medium' : 'font-semibold'}`}>{c.name}</span>
                  <span className={`ml-auto shrink-0 text-[11px] ${lida ? 'text-muted-foreground' : 'font-semibold text-primary'}`}>
                    {chatListTime(new Date(c.lastMessageAt))}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={`truncate text-xs ${lida ? 'text-muted-foreground' : 'text-foreground'}`}>{c.preview || '—'}</span>
                  {!lida && (
                    <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {c.unread}
                      <span className="sr-only"> não lida(s)</span>
                    </span>
                  )}
                </span>
                <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  {entrada && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Entrada</span>
                  )}
                  {c.lead && <span className="truncate rounded-full bg-surface-alt px-2 py-0.5 text-muted-foreground">{c.lead.stage}</span>}
                  {!c.lead && c.patient && <span className="rounded-full bg-surface-alt px-2 py-0.5 text-muted-foreground">Paciente</span>}
                  {c.awaitingReply && !entrada && <span className="rounded-full px-1 py-0.5 text-amber-700 dark:text-amber-300">Sem resposta</span>}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
