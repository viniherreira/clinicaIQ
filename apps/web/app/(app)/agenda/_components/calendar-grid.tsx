'use client';

import { useCallback } from 'react';
import {
  GRID_START_HOUR, GRID_END_HOUR, SLOT_HEIGHT_PX, SLOT_MINUTES,
  TOTAL_HEIGHT_PX,
} from './constants';
import { AppointmentBlock } from './appointment-block';
import { CurrentTimeIndicator } from './current-time-indicator';
import { isToday, parseISO } from 'date-fns';

interface Professional {
  id: string;
  name: string;
  specialty?: string | null;
  color: string;
}

interface Appointment {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
  status: string;
  patient: { id: string; name: string };
  professional: { id: string; name: string; specialty?: string | null };
  procedure?: { id: string; name: string; durationMinutes: number } | null;
}

interface CalendarGridProps {
  dateStr: string;
  professionals: Professional[];
  appointments: Appointment[];
  visibleProfessionals: Set<string>;
  mode: 'grouped' | 'sidebyside';
  onAppointmentClick: (id: string) => void;
  onSlotClick?: (professionalId: string, dateStr: string, timeStr: string) => void;
}

const HOUR_PX = (60 / SLOT_MINUTES) * SLOT_HEIGHT_PX;
const HEADER_H = 44;

/** Hour + half-hour lines as two repeating gradients — a single painted layer
 *  per column instead of ~84 absolutely-positioned divs, which keeps wheel
 *  scrolling smooth even with many professionals. */
const GRID_BG: React.CSSProperties = {
  backgroundImage: [
    `repeating-linear-gradient(to bottom, hsl(var(--border)) 0 1px, transparent 1px ${HOUR_PX}px)`,
    `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_PX / 2}px, hsl(var(--border) / 0.45) ${HOUR_PX / 2}px calc(${HOUR_PX / 2}px + 1px), transparent calc(${HOUR_PX / 2}px + 1px) ${HOUR_PX}px)`,
  ].join(', '),
};

function TimeColumn() {
  const hours: React.ReactNode[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    const top = ((h - GRID_START_HOUR) * 60 / SLOT_MINUTES) * SLOT_HEIGHT_PX;
    hours.push(
      <span
        key={h}
        className="absolute right-2.5 select-none font-mono text-[10px] font-medium tabular-nums text-muted-foreground"
        style={{ top: top - 7 }}
        aria-hidden="true"
      >
        {String(h).padStart(2, '0')}:00
      </span>
    );
  }
  return (
    <div className="relative w-14 shrink-0 border-r border-border" style={{ height: TOTAL_HEIGHT_PX }}>
      {hours}
    </div>
  );
}

function ColumnHeader({ prof }: { prof: Professional }) {
  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-center gap-2 border-b border-l border-border bg-surface/95 px-2 backdrop-blur-sm"
      style={{ height: HEADER_H }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: prof.color }}
        aria-hidden="true"
      >
        {prof.name.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs font-semibold text-foreground">{prof.name}</p>
        {prof.specialty && <p className="truncate text-[10px] text-muted-foreground">{prof.specialty}</p>}
      </div>
    </div>
  );
}

export function CalendarGrid({
  dateStr, professionals, appointments, visibleProfessionals, mode,
  onAppointmentClick, onSlotClick,
}: CalendarGridProps) {
  const visibleProfs = professionals.filter((p) => visibleProfessionals.has(p.id));
  const isCurrentDay = isToday(parseISO(dateStr));

  const appointmentsWithColor = appointments.map((apt) => ({
    ...apt,
    professionalColor: professionals.find((p) => p.id === apt.professional.id)?.color,
  }));

  const handleSlotClick = useCallback(
    (professionalId: string, e: React.MouseEvent<HTMLElement>) => {
      if (!onSlotClick) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, e.clientY - rect.top);
      const minutes = Math.floor(y / SLOT_HEIGHT_PX) * SLOT_MINUTES;
      const hours = GRID_START_HOUR + Math.floor(minutes / 60);
      const mins = minutes % 60;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      onSlotClick(professionalId, dateStr, timeStr);
    },
    [onSlotClick, dateStr]
  );

  if (mode === 'sidebyside') {
    return (
      <div className="flex min-w-max">
        <div className="sticky left-0 z-40 bg-surface">
          <div className="sticky top-0 z-50 border-b border-border bg-surface" style={{ height: HEADER_H }} />
          <TimeColumn />
        </div>

        {visibleProfs.map((prof) => {
          const profApts = appointmentsWithColor.filter((a) => a.professional.id === prof.id);
          return (
            <div key={prof.id} className="w-56 min-w-44 flex-1">
              <ColumnHeader prof={prof} />
              <div
                className="group/col relative border-l border-border"
                style={{ height: TOTAL_HEIGHT_PX, ...GRID_BG }}
              >
                {onSlotClick && (
                  <button
                    type="button"
                    onClick={(e) => handleSlotClick(prof.id, e)}
                    className="absolute inset-0 w-full cursor-pointer transition-colors hover:bg-primary/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Criar agendamento para ${prof.name}`}
                  />
                )}
                {isCurrentDay && <CurrentTimeIndicator />}
                {profApts.map((apt) => (
                  <AppointmentBlock key={apt.id} appointment={apt} onClick={onAppointmentClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Grouped mode
  return (
    <div className="flex">
      <div className="sticky left-0 z-40 bg-surface">
        <div className="border-b border-border bg-surface" style={{ height: HEADER_H }} />
        <TimeColumn />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="sticky top-0 z-30 flex items-center gap-3 overflow-x-auto border-b border-border bg-surface/95 px-3 backdrop-blur-sm"
          style={{ height: HEADER_H }}
        >
          {visibleProfs.map((p) => (
            <span key={p.id} className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
              {p.name}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height: TOTAL_HEIGHT_PX, ...GRID_BG }}>
          {onSlotClick && visibleProfs.length === 1 && (
            <button
              type="button"
              onClick={(e) => handleSlotClick(visibleProfs[0].id, e)}
              className="absolute inset-0 w-full cursor-pointer transition-colors hover:bg-primary/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              aria-label="Criar agendamento"
            />
          )}
          {isCurrentDay && <CurrentTimeIndicator />}
          {appointmentsWithColor
            .filter((a) => visibleProfessionals.has(a.professional.id))
            .map((apt) => (
              <AppointmentBlock key={apt.id} appointment={apt} onClick={onAppointmentClick} />
            ))}
        </div>
      </div>
    </div>
  );
}
