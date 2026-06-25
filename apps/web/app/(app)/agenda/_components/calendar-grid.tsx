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

function TimeColumn() {
  const hours: React.ReactNode[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    const top = ((h - GRID_START_HOUR) * 60 / SLOT_MINUTES) * SLOT_HEIGHT_PX;
    hours.push(
      <span
        key={h}
        className="absolute right-2 text-[10px] text-muted-foreground select-none"
        style={{ top: top - 7 }}
        aria-hidden="true"
      >
        {String(h).padStart(2, '0')}:00
      </span>
    );
  }
  return (
    <div className="relative shrink-0 w-14 border-r border-border" style={{ height: TOTAL_HEIGHT_PX }}>
      {hours}
    </div>
  );
}

function GridLines() {
  const lines: React.ReactNode[] = [];
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const minutes = (h - GRID_START_HOUR) * 60 + m;
      const top = (minutes / SLOT_MINUTES) * SLOT_HEIGHT_PX;
      const isHour = m === 0;
      const isHalf = m === 30;
      lines.push(
        <div
          key={`${h}-${m}`}
          aria-hidden="true"
          className={[
            'absolute inset-x-0 border-t pointer-events-none',
            isHour ? 'border-border' : isHalf ? 'border-border/60' : 'border-border/30',
          ].join(' ')}
          style={{ top }}
        />
      );
    }
  }
  return <>{lines}</>;
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
      <div className="flex overflow-x-auto">
        <div className="sticky left-0 z-10 bg-surface">
          <div className="h-10 border-b border-border" />
          <TimeColumn />
        </div>

        {visibleProfs.map((prof) => {
          const profApts = appointmentsWithColor.filter((a) => a.professional.id === prof.id);
          return (
            <div key={prof.id} className="flex-1 min-w-[180px]">
              <div
                className="h-10 border-b border-l border-border flex items-center justify-center gap-2 px-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: prof.color }}
                  aria-hidden="true"
                />
                <span className="text-xs font-medium text-foreground truncate">{prof.name}</span>
              </div>
              <div className="relative border-l border-border" style={{ height: TOTAL_HEIGHT_PX }}>
                {onSlotClick && (
                  <button
                    type="button"
                    onClick={(e) => handleSlotClick(prof.id, e)}
                    className="absolute inset-0 w-full cursor-pointer"
                    aria-label={`Criar agendamento para ${prof.name}`}
                  />
                )}
                <GridLines />
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
      <div className="sticky left-0 z-10 bg-surface">
        <div className="h-10 border-b border-border" />
        <TimeColumn />
      </div>
      <div className="flex-1">
        <div className="h-10 border-b border-border flex items-center px-3 gap-2">
          {visibleProfs.map((p) => (
            <span key={p.id} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
              {p.name}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height: TOTAL_HEIGHT_PX }}>
          {onSlotClick && visibleProfs.length === 1 && (
            <button
              type="button"
              onClick={(e) => handleSlotClick(visibleProfs[0].id, e)}
              className="absolute inset-0 w-full cursor-pointer"
              aria-label="Criar agendamento"
            />
          )}
          <GridLines />
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
