'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setMyAvailabilityAction } from '@/app/(crm)/crm/configuracoes/team-actions';

/**
 * "Disponível / Ausente" no topo do CRM, como o status online do Kommo: quem
 * está ausente fica fora da distribuição de leads (se a clínica escolheu assim).
 */
export function AvailabilityToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  useEffect(() => {
    setOn(initial);
  }, [initial]);

  return (
    <div className="flex items-center">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        title={erro || (on ? 'Você está recebendo leads. Toque para ficar ausente.' : 'Você está ausente. Toque para voltar a receber leads.')}
        onClick={() => {
          const quer = !on;
          setOn(quer);
          setErro('');
          start(async () => {
            const r = await setMyAvailabilityAction(quer);
            if (!r.ok) {
              setOn(!quer);
              setErro(r.message);
            }
            router.refresh();
          });
        }}
        className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 ${
          on
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
            : 'border-border bg-surface-alt text-muted-foreground'
        }`}
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
        <span className="hidden sm:inline">{on ? 'Disponível' : 'Ausente'}</span>
        <span className="sr-only sm:hidden">{on ? 'Disponível' : 'Ausente'}</span>
      </button>
      {erro && (
        <span role="alert" className="sr-only">
          {erro}
        </span>
      )}
    </div>
  );
}
