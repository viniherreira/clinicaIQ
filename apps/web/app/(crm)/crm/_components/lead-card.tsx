'use client';

import Link from 'next/link';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { CalendarDays, Check, ChevronRight, FileText, GripVertical, MoreHorizontal, Trash2, X } from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { formatCents, formatDue, formatWallDateTime, initials, timeAgo } from '@/crm/format';
import type { BoardLead, BoardStage } from '@/crm/types';

/** "09/10" neste ano, "09/10/2025" nos outros — sobra espaço para o nome no card. */
function dataCurta(iso: string) {
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', ...o });
  const d = new Date(iso);
  const mesmoAno = fmt(d, { year: 'numeric' }) === fmt(new Date(), { year: 'numeric' });
  return mesmoAno ? fmt(d, { day: '2-digit', month: '2-digit' }) : fmt(d, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export type MoveTarget = { kind: 'stage'; stageId: string } | { kind: 'won' } | { kind: 'lost' } | { kind: 'delete' };

/**
 * Um card do funil, no jeito do Kommo: quem é e há quanto tempo na etapa em
 * cima, o negócio em negrito, o valor, as tags e, no rodapé, a situação da
 * tarefa e o responsável.
 *
 * O mouse arrasta o card inteiro (um clique sem arrastar abre a ficha). O
 * teclado usa a alça, que aparece ao passar o mouse ou ao receber o foco: Tab
 * até ela, Espaço para pegar, setas para levar, Espaço para soltar. O menu
 * "Mover para…" faz o mesmo que arrastar, para quem prefere escolher numa lista.
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
  const { onPointerDown, ...teclado } = (drag.listeners ?? {}) as Record<string, (e: unknown) => void>;

  return (
    <article
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      onPointerDown={onPointerDown}
      aria-label={`${lead.name}${lead.title ? `, ${lead.title}` : ''}`}
      className={[
        'group relative rounded-[5px] border border-border bg-surface px-2.5 py-2 text-[13px] shadow-sm transition-[box-shadow,border-color]',
        'focus-within:ring-2 focus-within:ring-ring hover:border-link/50',
        dragging ? 'opacity-40' : '',
        overlay ? 'rotate-[1.5deg] shadow-xl' : '',
        drop.isOver && !dragging ? 'ring-2 ring-primary/40' : '',
      ].join(' ')}
    >
      <div className="flex gap-2.5">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[11px] font-semibold text-muted-foreground"
          aria-hidden="true"
        >
          {initials(lead.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/crm/leads/${lead.id}`}
              className="line-clamp-2 min-w-0 break-words font-semibold leading-snug text-foreground after:absolute after:inset-0 after:rounded-[5px] hover:text-link focus-visible:outline-none"
            >
              {titulo}
            </Link>
            <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
              <span title={`Criado em ${new Date(lead.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · nesta etapa ${timeAgo(new Date(lead.stageEnteredAt))}`} className="tabular-nums">
                <span className="sr-only">Criado em </span>
                {dataCurta(lead.createdAt)}
              </span>
              {!overlay && (
                <>
                  <button
                    type="button"
                    ref={drag.setActivatorNodeRef}
                    {...teclado}
                    {...drag.attributes}
                    aria-roledescription="card arrastável"
                    aria-label={`Arrastar ${lead.name}`}
                    className="relative z-10 flex h-5 w-4 cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-surface-alt hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <MoveMenu lead={lead} stages={stages} canDelete={canDelete} onMove={onMove} />
                </>
              )}
            </span>
          </div>
          {mostraNome && <p className="truncate text-xs text-muted-foreground">{lead.name}</p>}
          {lead.phoneMasked && (
            <p className="truncate text-[13px] tabular-nums text-link">
              <span className="sr-only">Telefone </span>
              {lead.phoneMasked}
            </p>
          )}
          {lead.valueCents != null && lead.valueCents > 0 && (
            <p className="text-xs tabular-nums text-foreground/90">{formatCents(lead.valueCents)}</p>
          )}
        </div>
      </div>

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

      <div className="mt-1.5 flex items-end justify-between gap-2">
        {lead.tags.length > 0 ? (
          <ul className="flex min-w-0 flex-wrap gap-1" aria-label="Tags">
            {lead.tags.slice(0, 2).map((t) => (
              <li key={t.id} className={`max-w-[120px] truncate rounded-[3px] px-1.5 py-px text-[11px] font-medium ${colorClasses(t.color).chip}`}>
                {t.name}
              </li>
            ))}
            {lead.tags.length > 2 && (
              <li className="rounded-[3px] bg-surface-alt px-1.5 py-px text-[11px] text-muted-foreground">
                +{lead.tags.length - 2}
                <span className="sr-only"> tags: {lead.tags.slice(2).map((t) => t.name).join(', ')}</span>
              </li>
            )}
          </ul>
        ) : (
          <span />
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          {lead.assignee ? (
            <span title={lead.assignee.name} className="text-[11px] text-muted-foreground">
              <span aria-hidden="true">{initials(lead.assignee.name)}</span>
              <span className="sr-only">Responsável: {lead.assignee.name}</span>
            </span>
          ) : (
            <span className="sr-only">Sem responsável</span>
          )}
          <TaskBadge lead={lead} />
        </span>
      </div>
    </article>
  );
}

/** A bolinha da tarefa, como no Kommo: laranja sem tarefa, vermelha atrasada, verde em dia. */
function TaskBadge({ lead }: { lead: BoardLead }) {
  const t = lead.task;
  const dot = (cor: string) => <span className={`h-2 w-2 shrink-0 rounded-full ${cor}`} aria-hidden="true" />;
  if (t.kind === 'none') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
        Sem tarefas
        {dot('bg-amber-500')}
      </span>
    );
  }
  if (t.kind === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-destructive">
        Atrasada{t.count > 1 ? ` (${t.count})` : ''}
        {dot('bg-red-500')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="sr-only">Próxima tarefa:</span> {formatDue(new Date(t.dueAt))}
      {dot('bg-green-500')}
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
        className="relative z-10 -mr-1.5 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-surface-alt hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 data-[state=open]:opacity-100"
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
