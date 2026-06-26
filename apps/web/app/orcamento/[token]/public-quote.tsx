'use client';

import { useState, useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { acceptPublicQuote, rejectPublicQuote } from './actions';

interface Props {
  token: string;
}

export function PublicQuoteActions({ token }: Props) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle');
  const [result, setResult] = useState<'accepted' | 'rejected' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptPublicQuote(token);
      if (res.ok) setResult('accepted');
      else setError(res.message ?? 'Não foi possível registrar.');
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectPublicQuote(token, reason);
      if (res.ok) setResult('rejected');
      else setError(res.message ?? 'Não foi possível registrar.');
    });
  }

  if (result === 'accepted') {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-5 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-success text-white">
          <Check className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="font-semibold text-success">Orçamento aceito!</p>
        <p className="mt-1 text-sm text-muted-foreground">A clínica foi notificada e entrará em contato. Obrigado!</p>
      </div>
    );
  }

  if (result === 'rejected') {
    return (
      <div className="rounded-xl border border-border bg-surface-alt p-5 text-center">
        <p className="font-semibold">Resposta registrada</p>
        <p className="mt-1 text-sm text-muted-foreground">Obrigado pelo retorno. Qualquer dúvida, fale com a clínica.</p>
      </div>
    );
  }

  return (
    <div role="alert" aria-live="polite" className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {mode === 'idle' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={accept}
            disabled={isPending}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-5 py-3 text-base font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Check className="h-5 w-5" aria-hidden="true" /> Aceitar orçamento
          </button>
          <button
            type="button"
            onClick={() => setMode('rejecting')}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-3 text-base font-medium hover:bg-surface-alt transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" /> Recusar
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <label htmlFor="reject-reason" className="block text-sm font-medium">
            Quer nos contar o motivo? <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-md border border-border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            placeholder="Ex: valor acima do esperado, vou pensar..."
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode('idle')} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Voltar</button>
            <button type="button" onClick={reject} disabled={isPending} className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {isPending ? 'Enviando...' : 'Confirmar recusa'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
