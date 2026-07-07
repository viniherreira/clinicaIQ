'use client';

import { GRID_START_HOUR, GRID_END_HOUR, SLOT_HEIGHT_PX, SLOT_MINUTES } from './constants';
import { nonWorkingIntervals, type DaySchedule } from '@/lib/schedule';

const minToPx = (m: number) => ((m - GRID_START_HOUR * 60) / SLOT_MINUTES) * SLOT_HEIGHT_PX;

/** Dims the hours outside the professional's working day (and the lunch break)
 *  so the agenda visually "ends" at the expediente. Purely decorative. */
export function WorkingHoursOverlay({ day }: { day: DaySchedule | null }) {
  const intervals = nonWorkingIntervals(day, GRID_START_HOUR * 60, GRID_END_HOUR * 60);
  if (intervals.length === 0) return null;
  return (
    <>
      {intervals.map(([from, to], i) => (
        <div
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-0 bg-muted/50 [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_6px,hsl(var(--muted-foreground)/0.07)_6px,hsl(var(--muted-foreground)/0.07)_7px)]"
          style={{ top: minToPx(from), height: minToPx(to) - minToPx(from) }}
        />
      ))}
    </>
  );
}
