'use client';

import Link from 'next/link';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlertTriangle, CalendarDays, Check, ChevronRight, Clock, FileText, GripVertical, MoreHorizontal, Trash2, X,
} from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { formatCents, formatDue, formatWallDateTime, initials, SOURCE_LABEL, timeAgo } from '@/crm/format';
import type { BoardLead, BoardStage } from '@/crm/types';

export type MoveTarget = { kind: 'stage'; stageId: string } | { kind: 'won' } | { kind: 'lost' } | { kind: 'delete' };

/**
 * Um card do funil.
 *
 * Arrasta-se pela alça (o ícone de pontinhos), que é também o caminho do
 * teclado: Tab até ela, Espaço para pegar, setas para levar, Espaço para
 * soltar. O resto do card abre a ficha — e o menu "Mover para…" faz o mesmo
 * que arrastar, para quem prefere escolher numa lista.
 */
export function LeadCard({
  lead,
  stages,
  canDelete,
  onMove,
  dragging = false,
  overlay = false,
}: {
  lead: BoardLead;
  stages: BoardStage[];
  canDelete: boolean;
  onMove: (lead: BoardLead, target: MoveTarget) => void;
  dragging?: boolean;
  overlay?: boolean;
}) {
  const drag = useDraggable({ id: lead.id, data: { lead }, disabled: overlay });
  const drop = useDroppable({ id: `card:${lead.id}`, data: { stageId: lead.stageId, leadId: lead.id }, disabled: overlay });
  const titulo = lead.title || lead.interest || lead.name;
  const mostraNome = titulo !== lead.name;

  return (
    <article
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      aria-label={`${lead.name}${lead.title ? `, ${lead.title}` : ''}`}
      className={[
        'group relative rounded-lg border border-border bg-surface p-2.5 pl-1.5 text-sm shadow-sm transition-shadow',
        'focus-within:ring-2 focus-within:ring-ring hover:shadow-md',
        dragging ? 'opacity-40' : '',
        overlay ? 'rotate-1 shadow-xl' : '',
        drop.isOver && !dragging ? 'ring-2 ring-primary/40' : '',
      ].join(' ')}
    >
      <div className="flex gap-1">
        <button
          type="button"
          ref={drag.setActivatorNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          aria-roledescription="card arrastável"
          aria-label={`Arrastar ${lead.name}`}
          className="relative z-10 mt-0.5 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <Link
              href={`/crm/leads/${lead.id}`}
              className="min-w-0 font-medium leading-snug text-foreground after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
            >
              <span className="block truncate">{titulo}</span>
            </Link>
            {!overlay && <MoveMenu lead={lead} stages={stages} canDelete={canDelete} onMove={onMove} />}
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {mostraNome ? `${lead.name} · ` : ''}
            {SOURCE_LABEL[lead.source] ?? lead.source}
            {lead.phoneMasked ? ` · ${lead.phoneMasked}` : ''}
          </p>

          {lead.tags.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Tags">
              {lead.tags.map((t) => (
                <li key={t.id} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${colorClasses(t.color).chip}`}>
                  {t.name}
                </li>
              ))}
            </ul>
          )}

          {(lead.nextAppointment || lead.openQuote) && (
            <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              {lead.nextAppointment && (
                <p className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Avaliação {formatWallDateTime(new Date(lead.nextAppointment.startTime))}
                </p>
              )}
              {lead.openQuote && (
                <p className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Orçamento nº {lead.openQuote.number} em aberto
                </p>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            <TaskBadge lead={lead} />
            <div className="flex items-center gap-1.5">
              {lead.valueCents != null && (
                <span className="text-xs font-medium tabular-nums text-foreground">{formatCents(lead.valueCents)}</span>
              )}
              {lead.assignee ? (
                <span
                  title={lead.assignee.name}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                >
                  <span aria-hidden="true">{initials(lead.assignee.name)}</span>
                  <span className="sr-only">Responsável: {lead.assignee.name}</span>
                </span>
              ) : (
                <span className="sr-only">Sem responsável</span>
              )}
            </div>
          </div>
          <p className="sr-only">Nesta etapa {timeAgo(new Date(lead.stageEnteredAt))}</p>
        </div>
      </div>
    </article>
  );
}

function TaskBadge({ lead }: { lead: BoardLead }) {
  const t = lead.task;
  if (t.kind === 'none') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Sem tarefa
      </span>
    );
  }
  if (t.kind === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        Atrasada{t.count > 1 ? ` (${t.count})` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Próxima tarefa:</span> {formatDue(new Date(t.dueAt))}
    </span>
  );
}

function MoveMenu({
  lead,
  stages,
  canDelete,
  onMove,
}: {
  lead: BoardLead;
  stages: BoardStage[];
  canDelete: boolean;
  onMove: (lead: BoardLead, target: MoveTarget) => void;
}) {
  const item =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-alt data-[disabled]:cursor-default data-[disabled]:opacity-50';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Mover ${lead.name} para…`}
        className="relative z-10 -mr-1 -mt-0.5 rounded-md p-1 text-muted-foreground opacity-70 hover:bg-surface-alt hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-[60] min-w-52 rounded-xl border border-border bg-surface p-1 text-foreground shadow-xl"
        >
          <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">Mover para</DropdownMenu.Label>
          {stages.map((s) => (
            <DropdownMenu.Item
              key={s.id}
              disabled={s.id === lead.stageId}
              onSelect={() => onMove(lead, { kind: 'stage', stageId: s.id })}
              className={item}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${colorClasses(s.color).dot}`} aria-hidden="true" />
              {s.name}
              {s.id === lead.stageId && <span className="ml-auto text-xs text-muted-foreground">atual</span>}
              {s.id !== lead.stageId && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-40" aria-hidden="true" />}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item onSelect={() => onMove(lead, { kind: 'won' })} className={`${item} text-green-700 dark:text-green-300`}>
            <Check className="h-4 w-4" aria-hidden="true" /> Ganho
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onMove(lead, { kind: 'lost' })} className={`${item} text-destructive`}>
            <X className="h-4 w-4" aria-hidden="true" /> Perdido…
          </DropdownMenu.Item>
          {canDelete && (
            <DropdownMenu.Item onSelect={() => onMove(lead, { kind: 'delete' })} className={`${item} text-muted-foreground`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
