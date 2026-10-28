'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copia um dado da ficha (telefone, e-mail, CPF) com um clique. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          // Sem permissão de área de transferência: nada a fazer.
        }
      }}
      aria-label={ok ? `${label} copiado` : `Copiar ${label}`}
      title={ok ? 'Copiado' : 'Copiar'}
      className="rounded-md p-1 text-muted-foreground opacity-60 transition hover:bg-surface-alt hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100"
    >
      {ok ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}
