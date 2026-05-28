'use client';

import { useState } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday,
  format, parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MiniCalendarProps {
  selectedDate: string;
  onSelect: (dateStr: string) => void;
}

export function MiniCalendar({ selectedDate, onSelect }: MiniCalendarProps) {
  const selected = parseISO(selectedDate);
  const [viewMonth, setViewMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));

  const monthStart = startOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });

  const days: Date[] = [];
  let cur = calStart;
  while (cur <= calEnd) {
    days.push(cur);
    cur = addDays(cur, 1);
  }

  return (
    <div className="w-full select-none">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-slate-700 capitalize">
          {format(viewMonth, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="p-1 rounded hover:bg-slate-100 text-slate-500"
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
          <span key={i} className="text-center text-[10px] font-medium text-slate-400">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isSelected = isSameDay(day, selected);
          const isTodayDay = isToday(day);
          const dateStr = format(day, 'yyyy-MM-dd');

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelect(dateStr)}
              aria-label={format(day, 'PPP', { locale: ptBR })}
              aria-pressed={isSelected}
              className={[
                'mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors',
                !isCurrentMonth && 'text-slate-300',
                isCurrentMonth && !isSelected && !isTodayDay && 'text-slate-600 hover:bg-slate-100',
                isTodayDay && !isSelected && 'text-emerald-600 font-semibold ring-1 ring-emerald-400',
                isSelected && 'bg-emerald-500 text-white font-semibold',
              ].filter(Boolean).join(' ')}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
