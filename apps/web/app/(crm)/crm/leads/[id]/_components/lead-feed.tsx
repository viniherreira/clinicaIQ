'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDue } from '@/crm/format';
import { instantToClinicLocal } from '@/crm/clock';
import type { LeadDetail } from '@/crm/lead-detail';
import type { BoardPerson } from '@/crm/types';
import { addNoteAction, createTaskAction } from '../actions';
import { TaskItem } from '@/components/crm-task-item';

/** O que precisa ser feito, no topo da ficha (concluir pede o resultado, como no Kommo). */
export function PendingTasks({ lead }: { lead: LeadDetail }) {
  if (lead.pendingTasks.length === 0) return null;
  return (
    <div className="border-b border-border bg-surface-alt/40 px-5 py-3">
      <h2 className="text-xs font-medium text-muted-foreground">Tarefas pendentes</h2>
      <ul className="mt-2 space-y-1.5">
        {lead.pendingTasks.map((t) => (
          <TaskItem
            key={t.id}
            task={{ id: t.id, text: t.text, leadId: lead.id }}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            main={<span className="block truncate">{t.text}</span>}
            meta={
              <span className={`shrink-0 text-xs ${t.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                {t.overdue ? 'Atrasada · ' : ''}
                {formatDue(new Date(t.dueAt))} · {t.assignee}
              </span>
            }
          />
        ))}
      </ul>
    </div>
  );
}

function amanha10h() {
  const d = new Date(Date.now() + 86_400_000);
  const local = instantToClinicLocal(d);
  return `${local.slice(0, 10)}T10:00`;
}

/**
 * Registrar a próxima ação (tarefa) ou uma nota. Fica no seletor de baixo da
 * ficha, ao lado do Bate-papo; o que for salvo aparece no meio da conversa.
 */
export function NoteTaskForm({
  mode,
  leadId,
  team,
  meId,
  assignedToId,
  noTask,
}: {
  mode: 'tarefa' | 'nota';
  leadId: string;
  team: BoardPerson[];
  meId: string;
  assignedToId: string | null;
  noTask: boolean;
}) {
  const router = useRouter();
  const tarefa = mode === 'tarefa';
  const [texto, setTexto] = useState('');
  const [quando, setQuando] = useState(amanha10h);
  const [quem, setQuem] = useState(assignedToId ?? meId);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [pending, start] = useTransition();
  const id = useId();

  return (
    <div className="p-4 pt-2">
      {noTask && tarefa && (
        <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">Este lead não tem próxima ação. Agende uma tarefa.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!texto.trim()) return setErro(tarefa ? 'Escreva o que precisa ser feito.' : 'Escreva a nota.');
          start(async () => {
            const r = tarefa
              ? await createTaskAction(leadId, { text: texto, due: quando, assignedToId: quem })
              : await addNoteAction(leadId, texto);
            if (!r.ok) return setErro(r.message);
            setAviso(tarefa ? 'Tarefa agendada.' : 'Nota registrada.');
            setTexto('');
            setQuando(amanha10h());
            router.refresh();
          });
        }}
      >
        <label htmlFor={`${id}-texto`} className="sr-only">
          {tarefa ? 'O que fazer' : 'Nota'}
        </label>
        <textarea
          id={`${id}-texto`}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErro('');
          }}
          rows={2}
          maxLength={tarefa ? 300 : 2000}
          placeholder={tarefa ? 'Ligar para confirmar a avaliação' : 'Escreva uma nota sobre o lead (só a equipe vê)'}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className="w-full resize-none rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        {erro && (
          <p id={`${id}-erro`} role="alert" className="mt-1 text-xs text-destructive">
            {erro}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {tarefa && (
            <>
              <label htmlFor={`${id}-quando`} className="sr-only">
                Quando
              </label>
              <input
                id={`${id}-quando`}
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
              />
              <label htmlFor={`${id}-quem`} className="sr-only">
                Responsável pela tarefa
              </label>
              <select
                id={`${id}-quem`}
                value={quem}
                onChange={(e) => setQuem(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
              >
                {team.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <span className="flex-1" />
          <button type="submit" disabled={pending} className="btn-primary btn-sm">
            {pending ? 'Salvando…' : tarefa ? 'Agendar tarefa' : 'Salvar nota'}
          </button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </div>
  );
}
