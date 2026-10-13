/**
 * As cores dos rótulos da agenda. Escritas por extenso porque o Tailwind só gera
 * classe que encontra literal no código. Texto 800 sobre fundo 100 (claro) e
 * 200 sobre 900/50 (escuro): passa de 4,5:1 em todas.
 *
 * Mesma paleta das tags do CRM, mas separada: a agenda não depende do CRM.
 */
export const LABEL_COLORS = ['gray', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'violet'] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  gray: 'Cinza',
  blue: 'Azul',
  teal: 'Verde-água',
  green: 'Verde',
  amber: 'Âmbar',
  orange: 'Laranja',
  red: 'Vermelho',
  pink: 'Rosa',
  violet: 'Roxo',
};

const CLASSES: Record<LabelColor, { chip: string; dot: string }> = {
  gray: { chip: 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200', dot: 'bg-slate-500' },
  blue: { chip: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200', dot: 'bg-blue-500' },
  teal: { chip: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200', dot: 'bg-teal-500' },
  green: { chip: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200', dot: 'bg-green-500' },
  amber: { chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200', dot: 'bg-amber-500' },
  orange: { chip: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200', dot: 'bg-orange-500' },
  red: { chip: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200', dot: 'bg-red-500' },
  pink: { chip: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200', dot: 'bg-pink-500' },
  violet: { chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200', dot: 'bg-violet-500' },
};

export const isLabelColor = (c: string): c is LabelColor => (LABEL_COLORS as readonly string[]).includes(c);
export const labelClasses = (c: string) => CLASSES[isLabelColor(c) ? c : 'gray'];
