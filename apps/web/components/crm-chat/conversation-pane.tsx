'use client';

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Briefcase, Clock, FileText, Hand, Link2, MessageCircle, Plus, Search, Square, Stethoscope, UserRound } from 'lucide-react';
import type { ChatThread } from '@/crm/conversations';
import { initials } from '@/crm/format';
import {
  acceptConversationAction,
  assignConversationAction,
  botOptionsAction,
  linkConversationAction,
  retryChatAction,
  searchLinkTargetsAction,
  sendChatAction,
  sendMediaAction,
  startBotAction,
  stopBotAction,
  type LinkTarget,
} from '@/app/(crm)/crm/conversas/actions';
import { ChatComposer, type BotChoice, type QuickReplyOption } from './chat-composer';
import { ChatMessages } from './chat-messages';
import { ComposerModes, type ComposerMode } from './composer-modes';
import type { TimelineEntry } from '@/crm/timeline';
import { TemplatePicker } from './template-picker';

/**
 * Uma conversa aberta: quem é, as mensagens e a caixa de texto. Usada na tela
 * de Conversas e na aba Conversa da ficha do lead (`compact`, sem cabeçalho —
 * a ficha já diz quem é).
 */
export function ConversationPane({
  thread,
  quickReplies,
  onChanged,
  onBack,
  compact = false,
  canManage = false,
  headerAction,
  events,
  extraModes,
  team,
  meId,
}: {
  thread: ChatThread;
  /** A equipe, para transferir a conversa (nas Conversas). Sem ela, o cabeçalho só mostra quem atende. */
  team?: { id: string; name: string }[];
  /** Quem está usando, para o "Assumir". */
  meId?: string;
  quickReplies: QuickReplyOption[];
  /** Algo mudou (mensagem enviada, aceita, ligada): busque de novo. */
  onChanged: () => void;
  onBack?: () => void;
  compact?: boolean;
  /** Pode criar modelos (crm_config). */
  canManage?: boolean;
  /** Botão extra no cabeçalho (nas Conversas: abrir o lead em tela pequena). */
  headerAction?: React.ReactNode;
  /** Na ficha do lead: o histórico no meio das mensagens. */
  events?: TimelineEntry[];
  /** Na ficha do lead: Nota e Tarefa ao lado do Bate-papo, como no Kommo. */
  extraModes?: ComposerMode[];
}) {
  const c = thread.conversation;
  const [retrying, setRetrying] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  // Os robôs do "/" (como o Salesbot do Kommo). Guardado por conversa: a tela atualiza a cada poucos segundos.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);
  const robots = useMemo(
    () => ({
      load: async () => {
        const r = await botOptionsAction();
        return r.ok ? r.bots : [];
      },
      run: async (botId: string) => {
        const r = await startBotAction(c.id, botId);
        if (!r.ok) return r;
        setAviso(`Robô ${r.name} começou a conversar.`);
        onChangedRef.current();
        return { ok: true as const };
      },
    }),
    [c.id],
  );
  const composer = (
    <PaneComposer
      thread={thread}
      quickReplies={quickReplies}
      canManage={canManage}
      robots={robots}
      onChanged={onChanged}
      onAnnounce={setAviso}
    />
  );

  return (
    <section aria-label={`Conversa com ${c.name}`} className="flex min-h-0 flex-1 flex-col">
      {!compact && (
        <PaneHeader thread={thread} onChanged={onChanged} onBack={onBack} onAnnounce={setAviso} action={headerAction} team={team} meId={meId} />
      )}

      <ChatMessages
        messages={thread.messages}
        truncated={thread.truncated}
        contactName={c.contactName ?? c.name}
        retrying={retrying}
        onRetry={async (id) => {
          setRetrying(id);
          const r = await retryChatAction(id);
          setRetrying(null);
          setAviso(r.ok ? 'Mensagem na fila de novo.' : r.message);
          onChanged();
        }}
        events={events}
      />

      {extraModes ? (
        <ComposerModes modes={[{ key: 'chat', label: 'Bate-papo', icon: MessageCircle, content: composer }, ...extraModes]} />
      ) : (
        composer
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </section>
  );
}

/**
 * A caixa de escrever, com o robô que está conversando. Fora da janela de 24 h
 * (API oficial) ela continua igual, como no Kommo: ao enviar, o erro explica e
 * oferece mandar um modelo aprovado.
 */
function PaneComposer({
  thread,
  quickReplies,
  canManage,
  robots,
  onChanged,
  onAnnounce,
}: {
  thread: ChatThread;
  quickReplies: QuickReplyOption[];
  canManage: boolean;
  robots: { load: () => Promise<BotChoice[]>; run: (botId: string) => Promise<{ ok: true } | { ok: false; message: string }> };
  onChanged: () => void;
  onAnnounce: (s: string) => void;
}) {
  const c = thread.conversation;
  const setAviso = onAnnounce;
  const fechada = thread.channel === 'cloud' && !thread.windowOpen && c.status !== 'DECLINED';
  // O envio voltou com erro com a janela fechada: oferecer o modelo.
  const [pedirModelo, setPedirModelo] = useState(false);
  const [modelo, setModelo] = useState(false);
  const conferir = (r: { ok: true } | { ok: false; message: string }) => {
    if (!r.ok && fechada) setPedirModelo(true);
    return r;
  };

  const escolhendo = fechada && modelo;

  return (
    <>
      {escolhendo && (
        <TemplatePicker
          target={{ conversationId: c.id }}
          contactName={c.name === c.phoneMasked ? null : c.name}
          canManage={canManage}
          onCancel={() => setModelo(false)}
          onSent={() => {
            setModelo(false);
            setPedirModelo(false);
            setAviso('Modelo enviado para a fila do WhatsApp.');
            onChanged();
          }}
        />
      )}
      {/* Escondida, não desmontada: ao voltar do modelo, o que foi escrito continua lá. */}
      <div hidden={escolhendo}>
        {thread.bot && c.status !== 'DECLINED' && (
          <BotBanner
            conversationId={c.id}
            name={thread.bot.name}
            onStopped={() => {
              setAviso(`Robô ${thread.bot?.name ?? ''} parado. A conversa está com a equipe.`);
              onChanged();
            }}
          />
        )}
        <ChatComposer
          quickReplies={quickReplies}
          canManage={canManage}
          robots={robots}
          // O nome do cadastro vence o do WhatsApp ("Mari"); sem nenhum, a resposta fica sem nome.
          contactName={c.name === c.phoneMasked ? null : c.name}
          disabled={c.status === 'DECLINED'}
          disabledReason="Conversa recusada"
          onSend={async (text) => {
            const r = await sendChatAction(c.id, text);
            if (r.ok) {
              setAviso('Mensagem enviada para a fila do WhatsApp.');
              onChanged();
            }
            return conferir(r);
          }}
          onSendMedia={
            thread.mediaOk
              ? async (form) => {
                  const r = await sendMediaAction(c.id, form);
                  if (r.ok) {
                    setAviso('Arquivo enviado para a fila do WhatsApp.');
                    onChanged();
                  }
                  return conferir(r);
                }
              : undefined
          }
        />
        {fechada && pedirModelo && (
          <div className="flex justify-end bg-surface px-3 pb-2">
            <button type="button" onClick={() => setModelo(true)} className="btn-outline btn-sm">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Enviar um modelo aprovado
            </button>
          </div>
        )}
        {thread.channel === 'cloud' && thread.windowEndsAt && <SessionTimer endsAt={thread.windowEndsAt} />}
      </div>
    </>
  );
}

function PaneHeader({
  thread,
  onChanged,
  onBack,
  onAnnounce,
  action,
  team,
  meId,
}: {
  thread: ChatThread;
  onChanged: () => void;
  onBack?: () => void;
  onAnnounce: (s: string) => void;
  action?: React.ReactNode;
  team?: { id: string; name: string }[];
  meId?: string;
}) {
  const c = thread.conversation;
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  const [ligando, setLigando] = useState(false);
  const semNegocio = c.status !== 'DECLINED' && !c.lead?.open && !c.patient;

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) =>
    start(async () => {
      setErro('');
      const r = await fn();
      if (!r.ok) return setErro(r.message ?? 'Não foi possível.');
      onAnnounce(ok);
      setLigando(false);
      onChanged();
    });

  return (
    <header className="border-b border-border bg-surface px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="btn-ghost h-9 w-9 p-0 lg:hidden" aria-label="Voltar para a lista">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-hover dark:text-sky-300"
        >
          {initials(c.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{c.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {c.phoneMasked}
            {c.contactName && c.contactName !== c.name && <> · no WhatsApp: {c.contactName}</>}
          </p>
        </div>
        <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
          <Links thread={thread} />
        </div>
        {action}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
        <Links thread={thread} />
      </div>

      {c.status !== 'DECLINED' && (
        <Assignee
          thread={thread}
          team={team}
          meId={meId}
          pending={pending}
          onAssign={(userId, ok) => run(() => assignConversationAction(c.id, userId), ok)}
        />
      )}

      {semNegocio && (
        // Contato sem card e que não é paciente (a antiga Entrada, ou quem foi
        // arquivado e voltou). Paciente não ganha aviso: a conversa fica na ficha.
        // Na tela larga, o painel ao lado (`action`) já mostra o mesmo botão.
        <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-alt px-3 py-2 ${action ? 'xl:hidden' : ''}`}>
          <p className="mr-auto text-sm">Sem negócio aberto com este contato.</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => acceptConversationAction(c.id), 'Negócio aberto em Novo.')}
            className="btn-primary btn-sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Abrir negócio
          </button>
          <button type="button" disabled={pending} onClick={() => setLigando((v) => !v)} aria-expanded={ligando} className="btn-outline btn-sm">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Ligar a…
          </button>
        </div>
      )}
      {ligando && <LinkPicker onPick={(t) => run(() => linkConversationAction(c.id, t.kind === 'lead' ? { leadId: t.id } : { patientId: t.id }), `Ligada a ${t.label}.`)} />}
      {erro && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {erro}
        </p>
      )}
    </header>
  );
}

/**
 * Quem atende a conversa, como o "responsável" do chat no Kommo: sem ninguém,
 * o botão Assumir; com alguém, a troca pela lista da equipe.
 */
function Assignee({
  thread,
  team,
  meId,
  pending,
  onAssign,
}: {
  thread: ChatThread;
  team?: { id: string; name: string }[];
  meId?: string;
  pending: boolean;
  onAssign: (userId: string | null, ok: string) => void;
}) {
  const id = useId();
  const atual = thread.conversation.assignedTo;
  const nome = (uid: string | null) => (uid ? (team?.find((p) => p.id === uid)?.name ?? 'alguém da equipe') : '');
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {team?.length ? (
        <>
          <label htmlFor={`${id}-resp`} className="text-muted-foreground">
            Atende:
          </label>
          <select
            id={`${id}-resp`}
            value={atual?.id ?? ''}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value || null;
              onAssign(v, v ? `Conversa com ${nome(v)}.` : 'Conversa sem responsável.');
            }}
            className="h-7 max-w-[12rem] rounded-md border border-border bg-surface-alt px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="">Sem responsável</option>
            {atual && !team.some((p) => p.id === atual.id) && <option value={atual.id}>{atual.name}</option>}
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === meId ? `${p.name} (você)` : p.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="text-muted-foreground">Atende: {atual?.name ?? 'sem responsável'}</span>
      )}
      {!atual && meId && (
        <button type="button" disabled={pending} onClick={() => onAssign(meId, 'Conversa assumida por você.')} className="btn-primary h-7 px-2.5 text-xs">
          <Hand className="h-3.5 w-3.5" aria-hidden="true" /> Assumir
        </button>
      )}
    </div>
  );
}

/** "A sessão de mensagens termina em: 23h 18m" (janela de 24 h da API oficial), como no Kommo. */
function SessionTimer({ endsAt }: { endsAt: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const resta = new Date(endsAt).getTime() - agora;
  if (resta <= 0) return null;
  const h = Math.floor(resta / 3_600_000);
  const m = Math.floor((resta % 3_600_000) / 60_000);
  const pouco = resta < 3_600_000;
  return (
    <p className={`flex items-center justify-end gap-1.5 bg-surface px-3 pb-2 text-xs ${pouco ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      A sessão de mensagens termina em: <strong className="font-semibold tabular-nums">{h > 0 ? `${h}h ${m}m` : `${m}m`}</strong>
    </p>
  );
}

/** Um robô está conversando: quem é e o botão para a equipe assumir. */
function BotBanner({ conversationId, name, onStopped }: { conversationId: string; name: string; onStopped: () => void }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-alt px-3 py-2 text-xs">
      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="mr-auto min-w-0">
        O robô <strong className="font-semibold">{name}</strong> está conversando. Se você responder, ele para.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErro('');
            const r = await stopBotAction(conversationId).catch(() => ({ ok: false as const, message: 'Não foi possível parar o robô. Tente de novo.' }));
            if (!r.ok) return setErro(r.message);
            onStopped();
          })
        }
        className="btn-outline btn-sm"
      >
        <Square className="h-3 w-3" aria-hidden="true" /> Parar robô
      </button>
      {erro && (
        <p role="alert" className="w-full text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

function Links({ thread }: { thread: ChatThread }) {
  const c = thread.conversation;
  const chip =
    'inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs font-medium hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring';
  return (
    <>
      {c.lead && (
        <Link href={`/crm/leads/${c.lead.id}`} className={chip}>
          <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="max-w-[12rem] truncate">{c.lead.label}</span>
          <span className="text-muted-foreground">· {c.lead.stage}</span>
        </Link>
      )}
      {c.patient && (
        <Link href={`/pacientes/${c.patient.id}`} className={chip}>
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" /> Ficha do paciente
        </Link>
      )}
    </>
  );
}

function LinkPicker({ onPick }: { onPick: (t: LinkTarget) => void }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [itens, setItens] = useState<LinkTarget[]>([]);
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) {
      setItens([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      const r = await searchLinkTargetsAction(q);
      if (!vivo) return;
      setBuscando(false);
      setItens(r.ok ? r.targets : []);
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-2">
      <label htmlFor={`${id}-q`} className="sr-only">
        Buscar contato
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${id}-q`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome do lead ou do paciente"
          className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {buscando ? 'Buscando…' : q.trim().length >= 2 ? `${itens.length} resultado(s)` : ''}
      </p>
      {itens.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-y-auto">
          {itens.map((t) => (
            <li key={`${t.kind}-${t.id}`}>
              <button
                type="button"
                onClick={() => onPick(t)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="truncate">{t.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!buscando && q.trim().length >= 2 && itens.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Ninguém encontrado.</p>}
    </div>
  );
}
