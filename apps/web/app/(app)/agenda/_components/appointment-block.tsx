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

  return (
    <button
      type="button"
      onClick={() => onClick?.(appointment.id)}
      className={[
        'absolute left-0.5 right-0.5 overflow-hidden rounded-sm border-l-2 px-1 py-0.5 text-left text-xs transition-opacity',
        style.bg, style.text,
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500',
        isCancelled ? 'opacity-50' : 'hover:brightness-95',
      ].join(' ')}
      style={{
        top: topPx,
        height: heightPx,
        borderLeftColor: appointment.professionalColor ?? '#94a3b8',
      }}
      aria-label={`${appointment.patient.name}, ${timeLabel}, ${statusLabel}`}
    >
      <p className={['font-medium leading-tight truncate', isCancelled ? 'line-through' : ''].join(' ')}>
        {appointment.patient.name}
      </p>
      {heightPx >= 32 && (
        <p className="leading-tight truncate opacity-70">
          {timeLabel}
          {appointment.procedure && ` · ${appointment.procedure.name}`}
        </p>
      )}
    </button>
  );
}
