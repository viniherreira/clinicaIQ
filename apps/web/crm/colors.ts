import type { CrmColor } from './defaults';
import { CRM_COLORS } from './defaults';

/**
 * Cor de etapa e de tag → classes do Tailwind. Escritas por extenso porque o
 * Tailwind só gera classe que encontra literal no código.
 *
 * Texto sobre fundo colorido usa o tom 800 sobre 100 (claro) e 200 sobre
 * 900/50 (escuro): passa de 4,5:1 nos nove tons. A faixa da etapa é
 * decorativa (o nome está sempre escrito ao lado), então usa o tom 500.
 */
const CLASSES: Record<CrmColor, { stripe: string; chip: string; dot: string }> = {
  gray: { stripe: 'border-t-slate-500', chip: 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200', dot: 'bg-slate-500' },
  blue: { stripe: 'border-t-blue-500', chip: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200', dot: 'bg-blue-500' },
  teal: { stripe: 'border-t-teal-500', chip: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200', dot: 'bg-teal-500' },
  green: { stripe: 'border-t-green-500', chip: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200', dot: 'bg-green-500' },
  amber: { stripe: 'border-t-amber-500', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200', dot: 'bg-amber-500' },
  orange: { stripe: 'border-t-orange-500', chip: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200', dot: 'bg-orange-500' },
  red: { stripe: 'border-t-red-500', chip: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200', dot: 'bg-red-500' },
  pink: { stripe: 'border-t-pink-500', chip: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200', dot: 'bg-pink-500' },
  violet: { stripe: 'border-t-violet-500', chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200', dot: 'bg-violet-500' },
};

export const COLOR_LABEL: Record<CrmColor, string> = {
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

function asColor(name: string): CrmColor {
  return (CRM_COLORS as readonly string[]).includes(name) ? (name as CrmColor) : 'gray';
}

export const colorClasses = (name: string) => CLASSES[asColor(name)];
