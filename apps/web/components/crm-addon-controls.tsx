'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { turnOffCrmAction, setCrmSeatAction } from '@/app/(app)/planos/crm-actions';

/** "Desligar o CRM", com confirmação: sai da cobrança, os dados ficam guardados. */
export function CrmTurnOffButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm('Desligar o CRM? Ele sai da mensalidade e a equipe perde o acesso. Os leads ficam guardados se você religar.')) return;
          start(async () => {
            const r = await turnOffCrmAction();
            setAviso({ ok: r.ok, text: r.message ?? '' });
            router.refresh();
          });
        }}
        className="btn-outline btn-md"
      >
        {pending ? 'Desligando…' : 'Desligar o CRM'}
      </button>
      {aviso && (
        <p role={aviso.ok ? 'status' : 'alert'} className={`w-full text-sm ${aviso.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
          {aviso.text}
        </p>
      )}
    </>
  );
}

/** A chave "Acesso ao CRM" de uma pessoa da equipe. */
export function CrmSeatToggle({ userId, name, on, hint }: { userId: string; name: string; on: boolean; hint: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  // A chave muda na hora do clique; se o servidor recusar, volta.
  const [ligada, setLigada] = useState(on);
  useEffect(() => setLigada(on), [on]);
  return (
    <div className="flex flex-col items-end gap-1">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">{hint}</span>
        <input
          type="checkbox"
          role="switch"
          checked={ligada}
          disabled={pending}
          aria-label={`Acesso ao CRM para ${name}`}
          onChange={(e) => {
            setErro('');
            const quer = e.target.checked;
            setLigada(quer);
            start(async () => {
              const r = await setCrmSeatAction(userId, quer);
              if (!r.ok) {
                setLigada(!quer);
                setErro(r.message);
              }
              router.refresh();
            });
          }}
          className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-border transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        />
      </label>
      {erro && <p role="alert" className="max-w-xs text-right text-xs text-destructive">{erro}</p>}
    </div>
  );
}
