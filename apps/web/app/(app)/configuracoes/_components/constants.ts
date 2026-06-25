/** Distinct, AA-legible swatches used to color-code professionals across the
 *  agenda. Order matters: new professionals are auto-assigned the first unused
 *  color (see actions.nextAvailableColor). */
export const PROFESSIONAL_PALETTE = [
  '#0D9488', // teal
  '#2563EB', // blue
  '#7C3AED', // violet
  '#DB2777', // pink
  '#DC2626', // red
  '#EA580C', // orange
  '#CA8A04', // gold
  '#16A34A', // green
  '#0891B2', // cyan
  '#4F46E5', // indigo
  '#9333EA', // purple
  '#475569', // slate
] as const;

export const DEFAULT_PROFESSIONAL_COLOR = PROFESSIONAL_PALETTE[0];
