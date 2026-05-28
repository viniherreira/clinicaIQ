export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 21;
export const SLOT_MINUTES = 10;
export const SLOT_HEIGHT_PX = 16;
export const TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;
export const TOTAL_HEIGHT_PX = (TOTAL_MINUTES / SLOT_MINUTES) * SLOT_HEIGHT_PX;

export const STATUS_STYLES = {
  SCHEDULED:   { bg: 'bg-slate-400/20',   border: 'border-slate-400',   text: 'text-slate-700' },
  CONFIRMED:   { bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-800' },
  ATTENDED:    { bg: 'bg-blue-500/20',    border: 'border-blue-500',    text: 'text-blue-800' },
  CANCELLED:   { bg: 'bg-gray-100',       border: 'border-gray-300',    text: 'text-gray-400' },
  MISSED:      { bg: 'bg-red-500/15',     border: 'border-red-400',     text: 'text-red-700' },
  RESCHEDULED: { bg: 'bg-amber-500/15',   border: 'border-amber-400',   text: 'text-amber-700' },
} as const;

export const STATUS_LABELS = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  ATTENDED:    'Compareceu',
  CANCELLED:   'Cancelado',
  MISSED:      'Faltou',
  RESCHEDULED: 'Remarcado',
} as const;

export const TYPE_LABELS = {
  PARTICULAR: 'Particular',
  CONVENIO:   'Convênio',
  CORTESIA:   'Cortesia',
} as const;

export const PROFESSIONAL_COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4',
];
