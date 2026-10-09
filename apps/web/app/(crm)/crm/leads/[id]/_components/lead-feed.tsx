'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, CalendarClock, Check, CheckCircle2, CircleDot, FileText, MessageSquare, StickyNote, Trophy, XCircle } from 'lucide-react';
import { formatDue } from '@/crm/format';
import { instantToClinicLocal } from '@/crm/clock';
import type { LeadDetail } from '@/crm/lead-detail';
import type { TimelineKind } from '@/crm/timeline';
import type { BoardPerson } from '@/crm/types';
import { addNoteAction, completeTaskAction, createTaskAction } from '../actions';

const ICON: Record<TimelineKind, typeof CircleDot> = {
  event: CircleDot,
  note: StickyNote,
  task: CalendarClock,
  clinic: FileText,
  won: Trophy,
  lost: XCircle,
};

/**
 * A metade direita da ficha: o que precisa ser feito (tarefas pendentes), o
 * que já aconteceu (histórico, mais novo embaixo, como uma conversa) e a
 * caixa para registrar a próxima ação ou uma nota.
 */
export function LeadFeed({ lead, team, meId }: { lead: LeadDetail; team: BoardPerson[]; meId: string }) {
  const fimRef = useRef<HTMLDivElement>(null);
  useEffect(() => fimRef.current?.scrollIntoView({ block: 'end' }), [lead.timeline.length]);

  return (
    <section aria-label="Tarefas e histórico" className="flex min-h-0 flex-1 flex-col">
      <PendingTasks lead={lead} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h2 className="sr-only">Histórico</h2>
        <ol className="space-y-3">
          {lead.timeline.map((e) => {
            const Icon = e.who === 'Automação' ? Bot : ICON[e.kind];
            const nota = e.kind === 'note';
            return (
              <li key={e.id} className="flex gap-3">
                <span
                  className={[
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    e.kind === 'won' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : '',
                    e.kind === 'lost' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : '',
                    e.kind !== 'won' && e.kind !== 'lost' ? 'bg-surface-alt text-muted-foreground' : '',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{e.who}</span> · {formatDue(new Date(e.at))}
                  </p>
                  <p className={nota ? 'mt-1 whitespace-pre-wrap rounded-lg bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40' : 'mt-0.5 text-sm'}>
                    {e.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <div ref={fimRef} />
      </div>

      <Composer leadId={lead.id} team={team} meId={meId} assignedToId={lead.assignedToId} noTask={lead.task.kind === 'none'} />
    </section>
  );
}

function PendingTasks({ lead }: { lead: LeadDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');

  if (lead.pendingTasks.length === 0) return null;
  return (
    <div className="border-b border-border bg-surface-alt/40 px-5 py-3">
      <h2 className="text-xs font-medium text-muted-foreground">Tarefas pendentes</h2>
      <ul className="mt-2 space-y-1.5">
        {lead.pendingTasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await completeTaskAction(t.id, lead.id);
                  setAviso(r.ok ? `Tarefa "${t.text}" concluída.` : r.message);
                  if (r.ok) router.refresh();
                })
              }
              aria-label={`Concluir tarefa: ${t.text}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border text-transparent hover:border-success hover:text-success focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Check className="h-3 w-3" aria-hidden="true" />
            </button>
            <span className="min-w-0 flex-1 truncate">{t.text}</span>
            <span className={`shrink-0 text-xs ${t.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
              {t.overdue ? 'Atrasada · ' : ''}
              {formatDue(new Date(t.dueAt))} · {t.assignee}
            </span>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">{aviso}</p>
    </div>
  );
}

function amanha10h() {
  const d = new Date(Date.now() + 86_400_000);
  const local = instantToClinicLocal(d);
  return `${local.slice(0, 10)}T10:00`;
}

function Composer({
  leadId,
  team,
  meId,
  assignedToId,
  noTask,
}: {
  leadId: string;
  team: BoardPerson[];
  meId: string;
  assignedToId: string | null;
  noTask: boolean;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<'tarefa' | 'nota'>('tarefa');
  const [texto, setTexto] = useState('');
  const [quando, setQuando] = useState(amanha10h);
  const [quem, setQuem] = useState(assignedToId ?? meId);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [pending, start] = useTransition();
  const id = useId();

  const abas = [
    { key: 'tarefa' as const, label: 'Tarefa', icon: CheckCircle2 },
    { key: 'nota' as const, label: 'Nota', icon: StickyNote },
  ];

  return (
    <div className="border-t border-border bg-surface p-4">
      {noTask && aba === 'tarefa' && (
        <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">Este lead não tem próxima ação. Agende uma tarefa.</p>
      )}
      <div role="tablist" aria-label="Registrar" className="mb-2 flex gap-4 text-sm">
        {abas.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            id={`${id}-${a.key}`}
            aria-selected={aba === a.key}
            aria-controls={`${id}-painel`}
            onClick={() => { setAba(a.key); setErro(''); }}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-1 focus-visible:outline-2 focus-visible:outline-ring ${aba === a.key ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <a.icon className="h-4 w-4" aria-hidden="true" /> {a.label}
          </button>
        ))}
        <span className="inline-flex items-center gap-1.5 pb-1 text-muted-foreground" title="Chega com a integração do WhatsApp">
          <MessageSquare className="h-4 w-4" aria-hidden="true" /> Conversa <span className="text-xs">(em breve)</span>
        </span>
      </div>

      <form
        id={`${id}-painel`}
        role="tabpanel"
        aria-labelledby={`${id}-${aba}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!texto.trim()) return setErro(aba === 'tarefa' ? 'Escreva o que precisa ser feito.' : 'Escreva a nota.');
          start(async () => {
            const r = aba === 'tarefa'
              ? await createTaskAction(leadId, { text: texto, due: quando, assignedToId: quem })
              : await addNoteAction(leadId, texto);
            if (!r.ok) return setErro(r.message);
            setAviso(aba === 'tarefa' ? 'Tarefa agendada.' : 'Nota registrada.');
            setTexto('');
            setQuando(amanha10h());
            router.refresh();
          });
        }}
      >
        <label htmlFor={`${id}-texto`} className="sr-only">{aba === 'tarefa' ? 'O que fazer' : 'Nota'}</label>
        <textarea
          id={`${id}-texto`}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setErro(''); }}
          rows={2}
          maxLength={aba === 'tarefa' ? 300 : 2000}
          placeholder={aba === 'tarefa' ? 'Ligar para confirmar a avaliação' : 'Escreva uma nota sobre o lead'}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className="w-full resize-none rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        {erro && <p id={`${id}-erro`} role="alert" className="mt-1 text-xs text-destructive">{erro}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {aba === 'tarefa' && (
            <>
              <label htmlFor={`${id}-quando`} className="sr-only">Quando</label>
              <input
                id={`${id}-quando`}
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
              />
              <label htmlFor={`${id}-quem`} className="sr-only">Responsável pela tarefa</label>
              <select
                id={`${id}-quem`}
                value={quem}
                onChange={(e) => setQuem(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
              >
                {team.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </>
          )}
          <span className="flex-1" />
          <button type="submit" disabled={pending} className="btn-primary btn-sm">
            {pending ? 'Salvando…' : aba === 'tarefa' ? 'Agendar tarefa' : 'Salvar nota'}
          </button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="sr-only">{aviso}</p>
    </div>
  );
}
