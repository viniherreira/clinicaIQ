export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 21;
export const SLOT_MINUTES = 10;
export const SLOT_HEIGHT_PX = 16;
export const TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;
export const TOTAL_HEIGHT_PX = (TOTAL_MINUTES / SLOT_MINUTES) * SLOT_HEIGHT_PX;

/** Per-status visual treatment for appointment blocks. Soft tinted surface +
 *  matching text + a status dot. Dark-mode aware. The professional's own color
 *  is applied separately as the block's left border. */
export const STATUS_STYLES = {
  SCHEDULED: {
    bg: 'bg-slate-100 dark:bg-slate-700/40',
    text: 'text-slate-700 dark:text-slate-200',
    dot: 'bg-slate-400',
  },
  CONFIRMED: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    text: 'text-emerald-900 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  ATTENDED: {
    bg: 'bg-sky-50 dark:bg-sky-950/50',
    text: 'text-sky-900 dark:text-sky-200',
    dot: 'bg-sky-500',
  },
  CANCELLED: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
  MISSED: {
    bg: 'bg-red-50 dark:bg-red-950/50',
    text: 'text-red-800 dark:text-red-200',
    dot: 'bg-red-500',
  },
  RESCHEDULED: {
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    text: 'text-amber-900 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
} as const;

export const STATUS_LABELS = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  ATTENDED: 'Compareceu',
  CANCELLED: 'Cancelado',
  MISSED: 'Faltou',
  RESCHEDULED: 'Remarcado',
} as const;

export const TYPE_LABELS = {
  PARTICULAR: 'Particular',
  CONVENIO: 'Convênio',
  CORTESIA: 'Cortesia',
} as const;

/** Legacy fallback palette for professionals created before colors existed. */
export const PROFESSIONAL_COLORS = [
  '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C',
];
