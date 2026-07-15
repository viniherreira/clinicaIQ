'use client';

/**
 * Anatomical tooth glyphs for the odontogram, in the classic dental-chart
 * style: a root+crown outline plus an occlusal (top-down) view with the five
 * surfaces. Shapes are parametric by tooth type; lowers are the uppers
 * mirrored vertically. Pure SVG so status colors apply via CSS classes.
 */

export type ToothType = 'incisor' | 'canine' | 'premolar' | 'premolar2r' | 'molar';

/** FDI number → anatomical type (permanent quadrants 1-4, deciduous 5-8). */
export function toothTypeOf(fdi: number): ToothType {
  const quadrant = Math.floor(fdi / 10);
  const pos = fdi % 10;
  if (quadrant >= 5) {
    // Deciduous: 1-2 incisors, 3 canine, 4-5 molars
    if (pos <= 2) return 'incisor';
    if (pos === 3) return 'canine';
    return 'molar';
  }
  if (pos <= 2) return 'incisor';
  if (pos === 3) return 'canine';
  if (pos === 4) return (quadrant === 1 || quadrant === 2) ? 'premolar2r' : 'premolar';
  if (pos === 5) return 'premolar';
  return 'molar';
}

/** Root+crown outline paths, drawn root-up/crown-down in a 28×38 box. */
const OUTLINES: Record<ToothType, string> = {
  incisor:
    'M11 21 C11 8 12.4 3 14 3 C15.6 3 17 8 17 21 C17 29 16.2 34 14 34 C11.8 34 11 29 11 21 Z',
  canine:
    'M11 20 C11 7 12.8 2 14 2 C15.2 2 17 7 17 20 C17 27 15.6 31 14 35 C12.4 31 11 27 11 20 Z',
  premolar:
    'M9 21 C9 9 11 4 14 4 C17 4 19 9 19 21 C19 29 17.4 34 14 34 C10.6 34 9 29 9 21 Z',
  premolar2r:
    'M8 21 C8 9 9.6 4 11 4 C12.4 4 12.6 9 14 9 C15.4 9 15.6 4 17 4 C18.4 4 20 9 20 21 C20 29 18 34 14 34 C10 34 8 29 8 21 Z',
  molar:
    'M6 21 C6 9 7.6 4 9.6 4 C11.2 4 11.4 9 14 9 C16.6 9 16.8 4 18.4 4 C20.4 4 22 9 22 21 C22 29 19.6 34 14 34 C8.4 34 6 29 6 21 Z',
};

interface GlyphProps {
  type: ToothType;
  /** Lower-arch teeth render mirrored (root down). */
  flip?: boolean;
  outlineClass: string;
  crossed?: boolean;
  className?: string;
}

/** The root+crown outline. */
export function ToothOutline({ type, flip, outlineClass, crossed, className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 28 38"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}
    >
      <path d={OUTLINES[type]} fill="none" strokeWidth="1.4" className={outlineClass} />
      {crossed && (
        <g strokeWidth="1.8" strokeLinecap="round" className="stroke-red-500">
          <path d="M8 8 L20 32" />
          <path d="M20 8 L8 32" />
        </g>
      )}
    </svg>
  );
}

/** The occlusal (top-down) five-surface view. */
export function OcclusalView({
  outlineClass,
  fillClass,
  className,
}: {
  outlineClass: string;
  fillClass: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="20" height="20" rx="6" strokeWidth="1.4" className={`${outlineClass} ${fillClass}`} />
      <rect x="8.2" y="8.2" width="7.6" height="7.6" rx="2.4" fill="none" strokeWidth="1.2" className={outlineClass} />
      <g strokeWidth="1" className={outlineClass} opacity="0.55">
        <path d="M4.6 4.6 L8.6 8.6" />
        <path d="M19.4 4.6 L15.4 8.6" />
        <path d="M4.6 19.4 L8.6 15.4" />
        <path d="M19.4 19.4 L15.4 15.4" />
      </g>
    </svg>
  );
}
