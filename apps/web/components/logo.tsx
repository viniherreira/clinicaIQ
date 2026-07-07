/**
 * ClinicaIQ brand mark: a smile with a sparkle on the brand-gradient squircle.
 * The smile covers both dental and aesthetic clinics; the sparkle nods to the
 * "IQ". Shapes are inline SVG so the mark stays crisp at any size.
 */

const SIZES = {
  sm: { box: 'h-7 w-7 rounded-lg' },
  md: { box: 'h-9 w-9 rounded-xl' },
  lg: { box: 'h-11 w-11 rounded-2xl' },
} as const;

interface LogoMarkProps {
  size?: keyof typeof SIZES;
  /** `glass` renders a translucent white tile for use over the brand gradient. */
  variant?: 'brand' | 'glass';
  className?: string;
}

export function LogoMark({ size = 'md', variant = 'brand', className = '' }: LogoMarkProps) {
  const bg = variant === 'glass' ? 'bg-white/15 backdrop-blur' : 'bg-brand-gradient shadow-sm';
  return (
    <span className={`flex shrink-0 items-center justify-center ${SIZES[size].box} ${bg} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" focusable="false" aria-hidden="true">
        <path d="M19 36 Q32 50 45 36" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M32 11 L34.5 18.5 L42 21 L34.5 23.5 L32 31 L29.5 23.5 L22 21 L29.5 18.5 Z" fill="#fff" />
      </svg>
    </span>
  );
}

interface LogoWordmarkProps {
  /** Use when rendered over the brand gradient (keeps "IQ" white). */
  onDark?: boolean;
  className?: string;
}

/** "ClinicaIQ" with the IQ in the brand color. Pass font classes via className. */
export function LogoWordmark({ onDark = false, className = '' }: LogoWordmarkProps) {
  return (
    <span className={className}>
      Clinica<span className={onDark ? 'text-white/90' : 'text-primary'}>IQ</span>
    </span>
  );
}
