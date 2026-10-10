'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, MessageCircle, X } from 'lucide-react';
import type { ConversationSummary } from '@/crm/conversations';
import { chatListTime } from '@/crm/format';
import { acceptConversationAction, declineConversationAction } from '../conversas/actions';

/**
 * A coluna Entrada, à esquerda do funil, como a de "leads de entrada" do
 * Kommo: números novos que escreveram para a clínica. Aceitar vira lead em
 * Novo; recusar tira daqui. Não dá para arrastar — é decisão, não etapa.
 */
export function InboxColumn({ entries, onAnnounce }: { entries: ConversationSummary[]; onAnnounce: (msg: string) => void }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex w-72 shrink-0 flex-col rounded-xl bg-amber-50/70 dark:bg-amber-950/30">
      <header className="rounded-t-xl border-t-[3px] border-amber-400 px-3 pb-2 pt-2.5">
        <h2 id={headingId} className="flex items-baseline justify-between gap-2 text-sm font-semibold">
          <span>Entrada</span>
          <span className="text-xs font-normal text-muted-foreground">
            <span className="sr-only">, </span>
            {entries.length} {entries.length === 1 ? 'contato novo' : 'contatos novos'}
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Escreveram no WhatsApp</p>
      </header>
      <ul className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3" aria-label="Contatos na Entrada">
        {entries.map((c) => (
          <li key={c.id}>
            <InboxCard entry={c} onAnnounce={onAnnounce} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function InboxCard({ entry, onAnnounce }: { entry: ConversationSummary; onAnnounce: (msg: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');

  const agir = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) =>
    start(async () => {
      setErro('');
      const r = await fn();
      if (!r.ok) return setErro(r.message ?? 'Não foi possível.');
      onAnnounce(ok);
      router.refresh();
    });

  return (
    <article className="rounded-lg border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`/crm/conversas?c=${entry.id}`}
          className="truncate text-sm font-medium hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {entry.name}
        </Link>
        <span className="shrink-0 text-[11px] text-muted-foreground">{chatListTime(new Date(entry.lastMessageAt))}</span>
      </div>
      <p className="text-xs text-muted-foreground">{entry.phoneMasked}</p>
      {entry.preview && (
        <p className="mt-1.5 line-clamp-2 flex gap-1.5 text-xs">
          <MessageCircle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{entry.preview}</span>
        </p>
      )}
      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => agir(() => acceptConversationAction(entry.id), `${entry.name} aceito em Novo.`)}
          className="btn-primary btn-sm flex-1"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Aceitar<span className="sr-only"> {entry.name}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => agir(() => declineConversationAction(entry.id), `${entry.name} recusado.`)}
          className="btn-outline btn-sm"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Recusar<span className="sr-only"> {entry.name}</span>
        </button>
      </div>
      {erro && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {erro}
        </p>
      )}
    </article>
  );
}
