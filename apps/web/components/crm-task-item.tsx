'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { completeTaskAction } from '@/app/(crm)/crm/leads/[id]/actions';

/**
 * Uma tarefa pendente, como no Kommo: a bolinha abre "Resultado" (opcional) e
 * "Concluir". O resultado vai para o histórico do lead junto com a tarefa,
 * então quem pegar o lead depois sabe o que aconteceu na ligação.
 */
export function TaskItem({
  task,
  main,
  meta,
  className = '',
}: {
  task: { id: string; text: string; leadId: string };
  main: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState('');
  const [aviso, setAviso] = useState('');
  const [pending, start] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const concluir = () =>
    start(async () => {
      const r = await completeTaskAction(task.id, task.leadId, resultado);
      setAviso(r.ok ? `Tarefa "${task.text}" concluída.` : r.message);
      if (r.ok) {
        setAberto(false);
        setResultado('');
        router.refresh();
      }
    });

  return (
    <li className={className}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setAberto((v) => !v);
            setTimeout(() => campo.current?.focus(), 0);
          }}
          aria-expanded={aberto}
          aria-controls={`${id}-concluir`}
          aria-label={`Concluir tarefa: ${task.text}`}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 hover:border-success hover:text-success focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${
            aberto ? 'border-success text-success' : 'border-border text-transparent'
          }`}
        >
          <Check className="h-3 w-3" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">{main}</div>
        {meta}
      </div>
      {aberto && (
        <form
          id={`${id}-concluir`}
          className="mt-2 space-y-2 pl-8"
          onSubmit={(e) => {
            e.preventDefault();
            concluir();
          }}
        >
          <label htmlFor={`${id}-resultado`} className="block text-xs font-medium text-muted-foreground">
            Resultado (opcional)
          </label>
          <textarea
            ref={campo}
            id={`${id}-resultado`}
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAberto(false);
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                concluir();
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="Ex.: ligou, vai ver com o marido e retorna sexta"
            className="w-full rounded-lg border border-border bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary btn-sm">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> {pending ? 'Concluindo…' : 'Concluir'}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="btn-ghost btn-sm">
              Cancelar
            </button>
          </div>
        </form>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {aviso}
      </span>
    </li>
  );
}
