'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Download, Link2, Trash2, Check } from 'lucide-react';
import { markQuoteSent, deleteQuote } from '../actions';

interface Props {
  quoteId: string;
  status: string;
  publicToken: string;
}

export function QuoteDetailActions({ quoteId, status, publicToken }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDraft = status === 'DRAFT';

  function copyLink() {
    const url = `${window.location.origin}/orcamento/${publicToken}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    // Sharing the link IS sending it — move the quote out of draft so the
    // public page becomes actionable for the patient.
    if (isDraft) {
      startTransition(async () => {
        await markQuoteSent(quoteId);
        router.refresh();
      });
    }
  }

  function remove() {
    startTransition(async () => {
      await deleteQuote(quoteId);
      router.push('/orcamentos');
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={copyLink} className="btn-primary btn-md">
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Link copiado!' : 'Copiar link do paciente'}
      </button>
      <a href={`/orcamentos/${quoteId}/pdf`} target="_blank" rel="noopener noreferrer" className="btn-outline btn-md">
        <Download className="h-4 w-4" aria-hidden="true" /> PDF
      </a>
      {isDraft && (
        <Link href={`/orcamentos/${quoteId}/editar`} className="btn-outline btn-md">
          <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
        </Link>
      )}
      {confirmDelete ? (
        <span className="inline-flex items-center gap-2 text-sm">
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
