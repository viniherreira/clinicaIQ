'use client';

import { useMemo } from 'react';
import { Check, CheckCheck, X, Ban, Clock, RotateCw, Armchair, Stethoscope } from 'lucide-react';
import { wallClockTime, wallClockMinutes } from '@/lib/tz';
import { stageOf, STAGE_LABELS } from '@/lib/appointment-flow';
import { labelClasses } from '@/lib/label-colors';
import { GRID_START_HOUR, SLOT_HEIGHT_PX, SLOT_MINUTES, STATUS_STYLES } from './constants';

interface Appointment {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
  status: string;
  patient: { id: string; name: string };
  professional: { id: string; name: string; specialty?: string | null };
  procedure?: { id: string; name: string; durationMinutes: number } | null;
  professionalColor?: string;
  arrivedAt?: Date | string | null;
  startedAt?: Date | string | null;
  label?: { id: string; name: string; color: string } | null;
}

interface AppointmentBlockProps {
  appointment: Appointment;
  onClick?: (id: string) => void;
}

const STATUS_ICON = {
  SCHEDULED: Clock,
  CONFIRMED: Check,
  ARRIVED: Armchair,
  IN_PROGRESS: Stethoscope,
  ATTENDED: CheckCheck,
  CANCELLED: Ban,
  MISSED: X,
  RESCHEDULED: RotateCw,
} as const;

export function AppointmentBlock({ appointment, onClick }: AppointmentBlockProps) {
  const start = new Date(appointment.startTime);
  const end = new Date(appointment.endTime);

  const { topPx, heightPx } = useMemo(() => {
    const startMinutes = wallClockMinutes(start) - GRID_START_HOUR * 60;
    const endMinutes = wallClockMinutes(end) - GRID_START_HOUR * 60;
    return {
      topPx: (startMinutes / SLOT_MINUTES) * SLOT_HEIGHT_PX,
      heightPx: Math.max(((endMinutes - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT_PX, SLOT_HEIGHT_PX * 2),
    };
  }, [start, end]);

  const key = stageOf(appointment);
  const style = STATUS_STYLES[key] ?? STATUS_STYLES.SCHEDULED;
  const statusLabel = STAGE_LABELS[key];
  const Icon = STATUS_ICON[key] ?? Clock;
  const label = appointment.label;
  const timeLabel = wallClockTime(start);
  const isCancelled = appointment.status === 'CANCELLED';
  const compact = heightPx < 34;

  return (
    <button
      type="button"
      onClick={() => onClick?.(appointment.id)}
      className={[
        'group absolute left-1 right-1 z-10 flex flex-col overflow-hidden rounded-md border border-black/5 py-1 pl-2 pr-1.5 text-left shadow-sm transition-all',
        style.bg, style.text,
        'hover:z-20 hover:shadow-md hover:-translate-y-px',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        isCancelled ? 'opacity-70' : '',
      ].join(' ')}
      style={{
        top: topPx,
        height: heightPx,
        borderLeftWidth: 3,
        borderLeftColor: appointment.professionalColor ?? '#94a3b8',
      }}
      aria-label={`${timeLabel} ${appointment.patient.name}, ${appointment.professional.name}, ${statusLabel}${label ? `, rótulo ${label.name}` : ''}`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${style.icon}`} aria-hidden="true" />
        <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums opacity-80">{timeLabel}</span>
        <span className={`truncate text-xs font-semibold leading-tight ${isCancelled ? 'line-through' : ''}`}>
          {appointment.patient.name}
        </span>
        {label && (
          <span className={`ml-auto shrink-0 rounded px-1 text-[10px] font-semibold leading-4 ${labelClasses(label.color).chip}`} aria-hidden="true">
            {label.name}
          </span>
        )}
      </div>
      {!compact && (
        <span className="truncate pl-[18px] text-[11px] leading-tight opacity-70">
          {appointment.professional.name}
          {appointment.procedure && ` · ${appointment.procedure.name}`}
        </span>
      )}
    </button>
  );
}
