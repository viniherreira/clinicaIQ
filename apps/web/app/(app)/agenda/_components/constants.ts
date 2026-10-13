// A geometria da grade (início, fim e intervalo) vem das Regras da agenda: `lib/agenda-rules.ts` e `grid-context.tsx`.

/** Per-status visual treatment for appointment blocks. Soft tinted surface +
 *  matching text + a status dot. Dark-mode aware. The professional's own color
 *  is applied separately as the block's left border. */
export const STATUS_STYLES = {
  SCHEDULED: {
    bg: 'bg-slate-100 dark:bg-slate-700/40',
    text: 'text-slate-700 dark:text-slate-200',
    dot: 'bg-slate-400',
    icon: 'text-slate-500 dark:text-slate-400',
  },
  CONFIRMED: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/60',
    text: 'text-emerald-900 dark:text-emerald-100',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  ATTENDED: {
    bg: 'bg-sky-100 dark:bg-sky-950/60',
    text: 'text-sky-900 dark:text-sky-100',
    dot: 'bg-sky-500',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  CANCELLED: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground/40',
    icon: 'text-muted-foreground',
  },
  MISSED: {
    bg: 'bg-red-100 dark:bg-red-950/60',
    text: 'text-red-900 dark:text-red-100',
    dot: 'bg-red-500',
    icon: 'text-red-600 dark:text-red-400',
  },
  RESCHEDULED: {
    bg: 'bg-amber-100 dark:bg-amber-950/60',
    text: 'text-amber-900 dark:text-amber-100',
    dot: 'bg-amber-500',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  // As etapas do dia (ver lib/appointment-flow.ts): não são situações no banco.
  ARRIVED: {
    bg: 'bg-violet-100 dark:bg-violet-950/60',
    text: 'text-violet-900 dark:text-violet-100',
    dot: 'bg-violet-500',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  IN_PROGRESS: {
    bg: 'bg-blue-100 dark:bg-blue-950/60',
    text: 'text-blue-900 dark:text-blue-100',
    dot: 'bg-blue-600',
    icon: 'text-blue-700 dark:text-blue-300',
  },
} as const;

export const STATUS_LABELS = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  ATTENDED: 'Atendido',
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
