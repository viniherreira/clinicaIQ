'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KanbanSquare } from 'lucide-react';
import { turnOnCrmAction } from '@/app/(app)/planos/crm-actions';

/** "Experimentar 14 dias grátis" / "Ativar CRM": liga e leva para o funil. */
export function CrmTurnOnButton({ label, goTo = '/crm', className = 'btn-primary btn-md' }: { label: string; goTo?: string | null; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await turnOnCrmAction();
            setAviso({ ok: r.ok, text: r.message ?? '' });
            if (r.ok && goTo) router.push(goTo);
            else router.refresh();
          })
        }
        className={`${className} inline-flex items-center gap-1.5`}
      >
        <KanbanSquare className="h-4 w-4" aria-hidden="true" />
        {pending ? 'Ligando…' : label}
      </button>
      {aviso && (
        <p role={aviso.ok ? 'status' : 'alert'} className={`mt-2 w-full text-sm ${aviso.ok ? 'text-success' : 'text-destructive'}`}>
          {aviso.text}
        </p>
      )}
    </>
  );
}
