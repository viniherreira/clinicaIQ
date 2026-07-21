'use client';

/**
 * Anatomical tooth glyphs for the odontogram, in the classic dental-chart style:
 * a crown (status-filled) with 1–3 tapering roots, plus an occlusal (top-down)
 * five-surface view. Drawn root-up / crown-down; lower-arch teeth flip within
 * the viewBox. Pure SVG so status colors apply via CSS classes.
 */

export type ToothType = 'incisor' | 'canine' | 'premolar' | 'premolar2r' | 'molar';

/** FDI number → anatomical type (permanent quadrants 1-4, deciduous 5-8). */
export function toothTypeOf(fdi: number): ToothType {
  const quadrant = Math.floor(fdi / 10);
  const pos = fdi % 10;
  if (quadrant >= 5) {
    if (pos <= 2) return 'incisor';
    if (pos === 3) return 'canine';
    return 'molar'; // deciduous molars
  }
  if (pos <= 2) return 'incisor';
  if (pos === 3) return 'canine';
  if (pos === 4) return quadrant === 1 || quadrant === 2 ? 'premolar2r' : 'premolar';
  if (pos === 5) return 'premolar';
  return 'molar';
}

/** crown = fillable outline; roots = stroke-only prongs. viewBox 32×46. */
const SHAPES: Record<ToothType, { crown: string; roots: string }> = {
  incisor: {
    crown: 'M11 26 Q11 24 16 24 Q21 24 21 26 L21 40 Q21 44 16 44 Q11 44 11 40 Z',
    roots: 'M13.5 24 Q14.5 12 16 4 Q17.5 12 18.5 24',
  },
  canine: {
    crown: 'M11 26 Q16 23 21 26 L19.5 39 Q16 47 12.5 39 Z',
    roots: 'M13 24 Q14 11 16 3 Q18 11 19 24',
  },
  premolar: {
    crown: 'M10 26 Q10 24 16 24 Q22 24 22 26 L22 39 Q22 44 16 44 Q10 44 10 39 Z',
    roots: 'M13 24 Q14 11 16 4 Q18 11 19 24',
  },
  premolar2r: {
    crown: 'M10 26 Q10 24 16 24 Q22 24 22 26 L22 39 Q22 44 16 44 Q10 44 10 39 Z',
    roots: 'M12.5 24 Q11.5 12 10.5 5 M19.5 24 Q20.5 12 21.5 5',
  },
  molar: {
    crown: 'M6 26 Q6 24 16 24 Q26 24 26 26 L26 39 Q26 44 16 44 Q6 44 6 39 Z',
    roots: 'M16 24 L16 5 M10 24 Q9 13 8 6 M22 24 Q23 13 24 6',
  },
};

interface OutlineProps {
  type: ToothType;
  /** Lower-arch teeth render mirrored (crown up). */
  flip?: boolean;
  outlineClass: string;
  fillClass: string;
  crossed?: boolean;
  className?: string;
}

/** The crown + roots drawing. */
export function ToothOutline({ type, flip, outlineClass, fillClass, crossed, className }: OutlineProps) {
  const { crown, roots } = SHAPES[type];
  return (
    <svg viewBox="0 0 32 46" className={className} aria-hidden="true" focusable="false">
      {/* flip around the viewBox center so the mirrored tooth stays in frame */}
      <g transform={flip ? 'translate(0 46) scale(1 -1)' : undefined}>
        <path d={roots} fill="none" strokeWidth="1.4" strokeLinecap="round" className={outlineClass} />
        <path d={crown} strokeWidth="1.5" strokeLinejoin="round" className={`${outlineClass} ${fillClass}`} />
      </g>
      {crossed && (
        <g strokeWidth="2" strokeLinecap="round" className="stroke-red-500">
          <path d="M8 10 L24 40" />
          <path d="M24 10 L8 40" />
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
      <g strokeWidth="1" className={outlineClass} opacity="0.5">
        <path d="M4.6 4.6 L8.6 8.6" />
        <path d="M19.4 4.6 L15.4 8.6" />
        <path d="M4.6 19.4 L8.6 15.4" />
        <path d="M19.4 19.4 L15.4 15.4" />
      </g>
    </svg>
  );
}
