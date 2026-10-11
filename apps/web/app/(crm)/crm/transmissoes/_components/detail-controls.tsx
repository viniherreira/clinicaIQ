'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle } from 'lucide-react';
import { cancelBroadcastAction } from '../actions';

/** Enquanto a transmissão sai, os números se atualizam sozinhos. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => document.visibilityState === 'visible' && router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

export function CancelBroadcast({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm('Cancelar a transmissão? O que ainda não saiu não sai mais.')) return;
          start(async () => {
            const r = await cancelBroadcastAction(id);
            if (!r.ok) return setErro(r.message);
            router.refresh();
          });
        }}
        className="btn-outline btn-sm"
      >
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Cancelar transmissão
      </button>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </>
  );
}
