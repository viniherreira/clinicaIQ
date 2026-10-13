'use client';

import { useEffect, useState } from 'react';
import { useGrid } from './grid-context';

export function CurrentTimeIndicator() {
  const grid = useGrid();
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const calcTop = () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      if (minutes < grid.startHour * 60 || minutes > grid.endHour * 60) return null;
      return grid.minToPx(minutes);
    };
    setTop(calcTop());
    const id = setInterval(() => setTop(calcTop()), 60_000);
    return () => clearInterval(id);
  }, [grid]);

  if (top === null) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top }}
    >
      <div className="-ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-sm" />
      <div className="h-[2px] flex-1 rounded-full bg-red-500/90" />
    </div>
  );
}
