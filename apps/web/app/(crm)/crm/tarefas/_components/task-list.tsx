'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import { formatDue } from '@/crm/format';
import type { TaskRow } from '@/crm/task-list';
import { TaskItem } from '@/components/crm-task-item';

/** As tarefas de um grupo (Atrasadas, Hoje…), cada uma com o "Concluir" com resultado. */
export function TaskList({ tarefas, atrasada }: { tarefas: TaskRow[]; atrasada: boolean }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {tarefas.map((t) => (
        <TaskItem
          key={t.id}
          task={{ id: t.id, text: t.text, leadId: t.leadId }}
          className="px-4 py-3"
          main={
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {t.automatic && (
                  <>
                    <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">Criada pela automação:</span>
                  </>
                )}
                <span className="truncate">{t.text}</span>
              </p>
              <Link href={`/crm/leads/${t.leadId}`} className="text-xs text-primary hover:underline">
                {t.leadLabel}
              </Link>
            </>
          }
          meta={
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              <p className={atrasada ? 'font-medium text-destructive' : ''}>{formatDue(new Date(t.dueAt))}</p>
              <p>{t.assignee}</p>
            </div>
          }
        />
      ))}
    </ul>
  );
}
