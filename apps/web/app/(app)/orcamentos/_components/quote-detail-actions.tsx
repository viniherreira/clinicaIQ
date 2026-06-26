'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Send, Pencil, Download, Link2, Trash2, Check } from 'lucide-react';
import { sendQuote, deleteQuote } from '../actions';

interface Props {
  quoteId: string;
  status: string;
  publicToken: string;
}

export function QuoteDetailActions({ quoteId, status, publicToken }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDraft = status === 'DRAFT';
  const canSend = ['DRAFT', 'SENT', 'VIEWED'].includes(status);

  function send() {
    startTransition(async () => {
      const res = await sendQuote(quoteId);
      setFeedback(res.ok ? 'Orçamento enviado ✓' : (res.message ?? 'Falha ao enviar'));
      router.refresh();
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  function copyLink() {
    const url = `${window.location.origin}/orcamento/${publicToken}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteQuote(quoteId);
      router.push('/orcamentos');
    });
  }

  const btn = 'inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSend && (
        <button type="button" onClick={send} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <Send className="h-4 w-4" aria-hidden="true" /> {status === 'DRAFT' ? 'Enviar ao paciente' : 'Reenviar'}
        </button>
      )}
      <a href={`/orcamentos/${quoteId}/pdf`} target="_blank" rel="noopener noreferrer" className={btn}>
        <Download className="h-4 w-4" aria-hidden="true" /> PDF
      </a>
      <button type="button" onClick={copyLink} className={btn}>
        {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Copiado!' : 'Copiar link'}
      </button>
      {isDraft && (
        <Link href={`/orcamentos/${quoteId}/editar`} className={btn}>
          <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
        </Link>
      )}
      {confirmDelete ? (
        <span className="inline-flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Excluir?</span>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-border px-2.5 py-1 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Não</button>
          <button type="button" disabled={isPending} onClick={remove} className="rounded-md bg-destructive px-2.5 py-1 font-medium text-white hover:bg-destructive/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Sim</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Excluir orçamento" className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir
        </button>
      )}
      {feedback && <span role="status" className="w-full text-sm text-muted-foreground">{feedback}</span>}
    </div>
  );
}
