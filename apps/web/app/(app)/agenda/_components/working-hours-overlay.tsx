'use client';

import { nonWorkingIntervals, type DaySchedule } from '@/lib/schedule';
import { useGrid } from './grid-context';

/** Dims the hours outside the professional's working day (and the lunch break)
 *  so the agenda visually "ends" at the expediente. Purely decorative. */
export function WorkingHoursOverlay({ day }: { day: DaySchedule | null }) {
  const { minToPx, startHour, endHour } = useGrid();
  const intervals = nonWorkingIntervals(day, startHour * 60, endHour * 60);
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
