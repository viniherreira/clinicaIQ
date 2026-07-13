'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCw, ArrowLeft } from 'lucide-react';
import { reportError } from '@/lib/observability';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Algo deu errado</h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Tivemos um problema ao carregar esta página. Já registramos o ocorrido. Você pode tentar de novo.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary btn-md">
          <RotateCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
        </button>
        <Link href="/dashboard" className="btn-outline btn-md">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ir para o início
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-[11px] text-muted-foreground">código: {error.digest}</p>
      )}
    </div>
  );
}
