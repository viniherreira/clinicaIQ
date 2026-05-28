'use client';

import { useEffect, useState } from 'react';
import { GRID_START_HOUR, SLOT_HEIGHT_PX, SLOT_MINUTES } from './constants';

export function CurrentTimeIndicator() {
  const [top, setTop] = useState<number | null>(null);

  function calcTop() {
    const now = new Date();
    const minutes = (now.getHours() - GRID_START_HOUR) * 60 + now.getMinutes();
    if (minutes < 0 || minutes > (21 - GRID_START_HOUR) * 60) return null;
    return (minutes / SLOT_MINUTES) * SLOT_HEIGHT_PX;
  }

  useEffect(() => {
    setTop(calcTop());
    const id = setInterval(() => setTop(calcTop()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (top === null) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top }}
    >
      <div className="h-2 w-2 rounded-full bg-red-500 -ml-1 shrink-0" />
      <div className="h-px flex-1 bg-red-500" />
    </div>
  );
}
