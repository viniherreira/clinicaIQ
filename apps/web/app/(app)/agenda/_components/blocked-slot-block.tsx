'use client';

import { Lock } from 'lucide-react';
import { wallClockTime, wallClockMinutes } from '@/lib/tz';
import { GRID_START_HOUR, SLOT_HEIGHT_PX, SLOT_MINUTES } from './constants';

export interface BlockedSlotItem {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
  reason?: string | null;
  professional?: { id: string; name: string } | null;
}

/** A hatched, non-appointment block marking time the professional is unavailable
 *  (lunch, vacation, holiday…). Clicking asks to remove it. */
export function BlockedSlotBlock({
  slot,
  onClick,
}: {
  slot: BlockedSlotItem;
  onClick?: (id: string) => void;
}) {
  const start = new Date(slot.startTime);
  const end = new Date(slot.endTime);
  const startMin = wallClockMinutes(start) - GRID_START_HOUR * 60;
  const endMin = wallClockMinutes(end) - GRID_START_HOUR * 60;
  const topPx = (startMin / SLOT_MINUTES) * SLOT_HEIGHT_PX;
  const heightPx = Math.max(((endMin - startMin) / SLOT_MINUTES) * SLOT_HEIGHT_PX, SLOT_HEIGHT_PX * 1.5);
  const compact = heightPx < 32;

  return (
    <button
      type="button"
      onClick={() => onClick?.(slot.id)}
      className="group absolute left-1 right-1 z-10 flex flex-col overflow-hidden rounded-md border border-border bg-muted/80 px-2 py-1 text-left text-muted-foreground shadow-sm [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_5px,hsl(var(--muted-foreground)/0.12)_5px,hsl(var(--muted-foreground)/0.12)_6px)] transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      style={{ top: topPx, height: heightPx }}
      aria-label={`Horário bloqueado das ${wallClockTime(start)} às ${wallClockTime(end)}${slot.reason ? `, ${slot.reason}` : ''}. Clique para remover.`}
      title={slot.reason ? `Bloqueado — ${slot.reason}` : 'Bloqueado'}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums">{wallClockTime(start)}</span>
        {!compact && (
          <span className="truncate text-[11px] font-medium">{slot.reason || 'Bloqueado'}</span>
        )}
      </div>
    </button>
  );
}
