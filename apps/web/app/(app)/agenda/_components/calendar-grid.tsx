'use client';

import { useCallback } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  GRID_START_HOUR, GRID_END_HOUR, SLOT_HEIGHT_PX, SLOT_MINUTES,
  TOTAL_HEIGHT_PX,
} from './constants';
import { AppointmentBlock } from './appointment-block';
import { CurrentTimeIndicator } from './current-time-indicator';
import { WorkingHoursOverlay } from './working-hours-overlay';
import { BlockedSlotBlock, type BlockedSlotItem } from './blocked-slot-block';
import type { WeekSchedule } from '@/lib/schedule';

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
  view: 'day' | 'week';
  professionals: Professional[];
  appointments: Appointment[];
  blockedSlots: BlockedSlotItem[];
  workingHours: Record<string, WeekSchedule>;
  visibleProfessionals: Set<string>;
  mode: 'grouped' | 'sidebyside';
  onAppointmentClick: (id: string) => void;
  onBlockedSlotClick?: (id: string) => void;
  onSlotClick?: (professionalId: string, dateStr: string, timeStr: string) => void;
  /** Week view: clicking a day header opens that day. */
  onDayClick?: (dateStr: string) => void;
}

/** Weekday index (0=Sun..6=Sat) for a `yyyy-MM-dd` string. */
function weekdayOf(iso: string): number {
  return parseISO(iso).getDay();
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
    // Clamp first/last labels inside the column so they don't get clipped by
    // the sticky header above or the scroll edge below.
    const labelTop = h === GRID_START_HOUR ? top + 3 : h === GRID_END_HOUR ? top - 16 : top - 7;
    hours.push(
      <span
        key={h}
        className="absolute right-2.5 select-none font-mono text-[10px] font-medium tabular-nums text-muted-foreground"
        style={{ top: labelTop }}
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

function ProfessionalHeader({ prof }: { prof: Professional }) {
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
  dateStr, view, professionals, appointments, blockedSlots, workingHours, visibleProfessionals, mode,
  onAppointmentClick, onBlockedSlotClick, onSlotClick, onDayClick,
}: CalendarGridProps) {
  const visibleProfs = professionals.filter((p) => visibleProfessionals.has(p.id));
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const appointmentsWithColor = appointments
    .filter((a) => visibleProfessionals.has(a.professional.id))
    .map((apt) => ({
      ...apt,
      professionalColor: professionals.find((p) => p.id === apt.professional.id)?.color,
    }));

  const visibleBlocks = blockedSlots.filter((b) => b.professional && visibleProfessionals.has(b.professional.id));
  const scheduleFor = (profId: string, iso: string) => workingHours[profId]?.[weekdayOf(iso)] ?? null;

  const handleSlotClick = useCallback(
    (professionalId: string, slotDate: string, e: React.MouseEvent<HTMLElement>) => {
      if (!onSlotClick) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = Math.max(0, e.clientY - rect.top);
      const minutes = Math.floor(y / SLOT_HEIGHT_PX) * SLOT_MINUTES;
      const hours = GRID_START_HOUR + Math.floor(minutes / 60);
      const mins = minutes % 60;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
      onSlotClick(professionalId, slotDate, timeStr);
    },
    [onSlotClick]
  );

  // ── Week view: 7 day columns (Mon–Sun), appointments grouped by day ──
  if (view === 'week') {
    const base = parseISO(dateStr);
    const monday = addDays(base, -((base.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      return { iso: format(d, 'yyyy-MM-dd'), date: d };
    });
    const singleProf = visibleProfs.length === 1 ? visibleProfs[0] : null;

    return (
      <div className="flex min-w-max">
        <div className="sticky left-0 z-40 bg-surface">
          <div className="sticky top-0 z-50 border-b border-border bg-surface" style={{ height: HEADER_H }} />
          <TimeColumn />
        </div>

        {days.map(({ iso, date }) => {
          const isToday = iso === todayStr;
          const dayApts = appointmentsWithColor.filter(
            (a) => new Date(a.startTime).toISOString().slice(0, 10) === iso,
          );
          return (
            <div key={iso} className="w-44 min-w-36 flex-1">
              <button
                type="button"
                onClick={() => onDayClick?.(iso)}
                className="sticky top-0 z-30 flex w-full items-center justify-center gap-1.5 border-b border-l border-border bg-surface/95 px-2 backdrop-blur-sm transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                style={{ height: HEADER_H }}
                aria-label={`Abrir ${format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}`}
              >
                <span className={`text-xs font-medium capitalize ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {format(date, 'EEEEEE', { locale: ptBR }).replace('.', '')}
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                    isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  }`}
                >
                  {date.getDate()}
                </span>
              </button>
              <div
                className={`relative border-l border-border ${isToday ? 'bg-primary/[0.03]' : ''}`}
                style={{ height: TOTAL_HEIGHT_PX, ...GRID_BG }}
              >
                {singleProf && <WorkingHoursOverlay day={scheduleFor(singleProf.id, iso)} />}
                {onSlotClick && singleProf && (
                  <button
                    type="button"
                    onClick={(e) => handleSlotClick(singleProf.id, iso, e)}
                    className="absolute inset-0 w-full cursor-pointer transition-colors hover:bg-primary/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Criar agendamento em ${format(date, 'dd/MM')}`}
                  />
                )}
                {isToday && <CurrentTimeIndicator />}
                {singleProf && visibleBlocks
                  .filter((b) => new Date(b.startTime).toISOString().slice(0, 10) === iso)
                  .map((b) => <BlockedSlotBlock key={b.id} slot={b} onClick={onBlockedSlotClick} />)}
                {dayApts.map((apt) => (
                  <AppointmentBlock key={apt.id} appointment={apt} onClick={onAppointmentClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Day view ──────────────────────────────────────────────────────────
  const isCurrentDay = dateStr === todayStr;

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
              <ProfessionalHeader prof={prof} />
              <div className="relative border-l border-border" style={{ height: TOTAL_HEIGHT_PX, ...GRID_BG }}>
                <WorkingHoursOverlay day={scheduleFor(prof.id, dateStr)} />
                {onSlotClick && (
                  <button
                    type="button"
                    onClick={(e) => handleSlotClick(prof.id, dateStr, e)}
                    className="absolute inset-0 w-full cursor-pointer transition-colors hover:bg-primary/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Criar agendamento para ${prof.name}`}
                  />
                )}
                {isCurrentDay && <CurrentTimeIndicator />}
                {visibleBlocks
                  .filter((b) => b.professional?.id === prof.id)
                  .map((b) => <BlockedSlotBlock key={b.id} slot={b} onClick={onBlockedSlotClick} />)}
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
        <div className="sticky top-0 z-50 border-b border-border bg-surface" style={{ height: HEADER_H }} />
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
              onClick={(e) => handleSlotClick(visibleProfs[0].id, dateStr, e)}
              className="absolute inset-0 w-full cursor-pointer transition-colors hover:bg-primary/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              aria-label="Criar agendamento"
            />
          )}
          {isCurrentDay && <CurrentTimeIndicator />}
          {visibleBlocks.map((b) => (
            <BlockedSlotBlock key={b.id} slot={b} onClick={onBlockedSlotClick} />
          ))}
          {appointmentsWithColor.map((apt) => (
            <AppointmentBlock key={apt.id} appointment={apt} onClick={onAppointmentClick} />
          ))}
        </div>
      </div>
    </div>
  );
}
