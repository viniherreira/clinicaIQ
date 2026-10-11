'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Briefcase, Check, Link2, Plus, Search, Stethoscope, X } from 'lucide-react';
import type { ChatThread } from '@/crm/conversations';
import { initials } from '@/crm/format';
import {
  acceptConversationAction,
  declineConversationAction,
  linkConversationAction,
  retryChatAction,
  searchLinkTargetsAction,
  sendChatAction,
  type LinkTarget,
} from '@/app/(crm)/crm/conversas/actions';
import { ChatComposer, type QuickReplyOption } from './chat-composer';
import { ChatMessages } from './chat-messages';

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
}: {
  thread: ChatThread;
  quickReplies: QuickReplyOption[];
  /** Algo mudou (mensagem enviada, aceita, ligada): busque de novo. */
  onChanged: () => void;
  onBack?: () => void;
  compact?: boolean;
}) {
  const c = thread.conversation;
  const [retrying, setRetrying] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  return (
    <section aria-label={`Conversa com ${c.name}`} className="flex min-h-0 flex-1 flex-col">
      {!compact && <PaneHeader thread={thread} onChanged={onChanged} onBack={onBack} onAnnounce={setAviso} />}

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
      />

      <ChatComposer
        quickReplies={quickReplies}
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
          return r;
        }}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </section>
  );
}

function PaneHeader({
  thread,
  onChanged,
  onBack,
  onAnnounce,
}: {
  thread: ChatThread;
  onChanged: () => void;
  onBack?: () => void;
  onAnnounce: (s: string) => void;
}) {
  const c = thread.conversation;
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  const [ligando, setLigando] = useState(false);
  const entrada = c.status === 'INBOX';
  const semNegocio = c.status === 'ACTIVE' && !c.lead?.open;

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
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${entrada ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' : 'bg-primary/10 text-primary-hover dark:text-sky-300'}`}
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
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
        <Links thread={thread} />
      </div>

      {(entrada || semNegocio) && (
        <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${entrada ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-surface-alt'}`}>
          <p className="mr-auto text-sm">
            {entrada ? 'Número novo. Aceite para virar lead, ou ligue a quem já está no sistema.' : 'Sem negócio aberto com esta pessoa.'}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => acceptConversationAction(c.id), entrada ? 'Aceito. O lead foi criado em Novo.' : 'Negócio criado em Novo.')}
            className="btn-primary btn-sm"
          >
            {entrada ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            {entrada ? 'Aceitar' : 'Criar negócio'}
          </button>
          {entrada && (
            <>
              <button type="button" disabled={pending} onClick={() => setLigando((v) => !v)} aria-expanded={ligando} className="btn-outline btn-sm">
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Ligar a…
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => declineConversationAction(c.id), 'Conversa recusada.')}
                className="btn-ghost btn-sm"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Recusar
              </button>
            </>
          )}
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

  useEffect(() => inputRef.current?.focus(), []);
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
        Buscar lead ou paciente
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
