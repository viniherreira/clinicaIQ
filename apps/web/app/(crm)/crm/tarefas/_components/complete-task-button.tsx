'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { completeTaskAction } from '../../leads/[id]/actions';

export function CompleteTaskButton({ taskId, leadId, text }: { taskId: string; leadId: string; text: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await completeTaskAction(taskId, leadId);
            setAviso(r.ok ? `Tarefa "${text}" concluída.` : r.message);
            if (r.ok) router.refresh();
          })
        }
        aria-label={`Concluir tarefa: ${text}`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border text-transparent hover:border-success hover:text-success focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <Check className="h-3 w-3" aria-hidden="true" />
      </button>
      <span role="status" aria-live="polite" className="sr-only">{aviso}</span>
    </>
  );
}
