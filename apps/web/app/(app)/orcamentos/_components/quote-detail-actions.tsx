'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Download, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import { acceptQuote, reopenQuote, deleteQuote } from '../actions';

interface Props {
  quoteId: string;
  status: string;
}

export function QuoteDetailActions({ quoteId, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDraft = status === 'DRAFT';
  const isAccepted = status === 'ACCEPTED';
  const isRejected = status === 'REJECTED';

  function approve() {
    startTransition(async () => {
      await acceptQuote(quoteId);
      router.refresh();
    });
  }

  function reopen() {
    startTransition(async () => {
      await reopenQuote(quoteId);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteQuote(quoteId);
      router.push('/orcamentos');
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isAccepted && !isRejected && (
        <button type="button" onClick={approve} disabled={isPending} className="btn-primary btn-md">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {isPending ? 'Aprovando…' : 'Aprovar orçamento'}
        </button>
      )}

      {isAccepted && (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Aprovado
          </span>
          <button type="button" onClick={reopen} disabled={isPending} className="btn-outline btn-md">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reabrir
          </button>
        </>
      )}

      <a href={`/orcamentos/${quoteId}/pdf`} target="_blank" rel="noopener noreferrer" className="btn-outline btn-md">
        <Download className="h-4 w-4" aria-hidden="true" /> PDF
      </a>

      {isDraft && (
        <Link href={`/orcamentos/${quoteId}/editar`} className="btn-outline btn-md">
          <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
        </Link>
      )}

      {confirmDelete ? (
        <span className="ml-auto inline-flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Excluir?</span>
          <button type="button" onClick={() => setConfirmDelete(false)} className="btn-outline btn-sm">Não</button>
          <button type="button" disabled={isPending} onClick={remove} className="btn-danger btn-sm">Sim</button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label="Excluir orçamento"
          className="btn-ghost btn-md ml-auto hover:!bg-destructive/10 hover:!text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir
        </button>
      )}
    </div>
  );
}
