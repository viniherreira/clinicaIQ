'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import {
  GRID_START_HOUR, SLOT_HEIGHT_PX, SLOT_MINUTES, STATUS_STYLES, STATUS_LABELS,
} from './constants';

interface Appointment {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
  status: string;
  patient: { id: string; name: string };
  professional: { id: string; name: string; specialty?: string | null };
  procedure?: { id: string; name: string; durationMinutes: number } | null;
  professionalColor?: string;
}

interface AppointmentBlockProps {
  appointment: Appointment;
  onClick?: (id: string) => void;
}

export function AppointmentBlock({ appointment, onClick }: AppointmentBlockProps) {
  const start = new Date(appointment.startTime);
  const end = new Date(appointment.endTime);

  const { topPx, heightPx } = useMemo(() => {
    const startMinutes = (start.getHours() - GRID_START_HOUR) * 60 + start.getMinutes();
    const endMinutes = (end.getHours() - GRID_START_HOUR) * 60 + end.getMinutes();
    return {
      topPx: (startMinutes / SLOT_MINUTES) * SLOT_HEIGHT_PX,
      heightPx: Math.max(((endMinutes - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT_PX, SLOT_HEIGHT_PX * 2),
    };
  }, [start, end]);

  const style = STATUS_STYLES[appointment.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.SCHEDULED;
  const statusLabel = STATUS_LABELS[appointment.status as keyof typeof STATUS_LABELS] ?? appointment.status;
  const timeLabel = `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`;
  const isCancelled = appointment.status === 'CANCELLED';
  const compact = heightPx < 34;

  return (
    <button
      type="button"
      onClick={() => onClick?.(appointment.id)}
      className={[
        'group absolute left-1 right-1 z-10 flex flex-col overflow-hidden rounded-md border border-black/5 pl-2 pr-1.5 py-1 text-left shadow-sm transition-all',
        style.bg, style.text,
        'hover:z-20 hover:shadow-md hover:-translate-y-px',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        isCancelled ? 'opacity-60' : '',
      ].join(' ')}
      style={{
        top: topPx,
        height: heightPx,
        borderLeftWidth: 3,
        borderLeftColor: appointment.professionalColor ?? '#94a3b8',
      }}
      aria-label={`${appointment.patient.name}, ${timeLabel}, ${appointment.professional.name}, ${statusLabel}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
        <span className={`truncate text-xs font-semibold leading-tight ${isCancelled ? 'line-through' : ''}`}>
          {appointment.patient.name}
        </span>
      </div>
      {!compact && (
        <span className="truncate pl-3 text-[11px] leading-tight opacity-75">
          {timeLabel}
          {appointment.procedure && ` · ${appointment.procedure.name}`}
        </span>
      )}
    </button>
  );
}
