/**
 * ClinicaIQ brand mark: um dente branco num círculo azul-saúde.
 *
 * Desenhado em SVG a partir da arte da logo, e não usado como imagem: fica
 * nítido em qualquer tamanho, do ícone da aba ao cabeçalho da landing. O brilho
 * no alto do dente é um recorte de verdade (`evenodd`), e não uma mancha azul
 * pintada por cima — por isso o símbolo funciona também sobre o degradê.
 */

/** Dente + recorte do brilho, num quadro de 64 em que o círculo ocupa tudo. */
export const TOOTH_PATH =
  'M23.2 14.4C19 14.4 15.5 18.2 15.5 23.6C15.5 27.6 17.3 30.6 18.3 33.6C19.2 36.2 19.1 40 19.6 43C20.1 46.8 21.6 49.8 24.4 49.8C26.4 49.8 27.2 48.2 27.8 45.6C28.6 42 29.2 38.1 32 38.1C34.8 38.1 35.4 42 36.2 45.6C36.8 48.2 37.6 49.8 39.6 49.8C42.4 49.8 43.9 46.8 44.4 43C44.9 40 44.8 36.2 45.7 33.6C46.7 30.6 48.5 27.6 48.5 23.6C48.5 18.2 45 14.4 40.8 14.4C37.4 14.4 34.6 16.6 32 18.3C29.4 16.6 26.6 14.4 23.2 14.4ZM32.1 18.4C34.3 20 37.2 20.4 39.8 19C37.1 19.3 34.5 19 32.1 18.4Z';

const SIZES = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
} as const;

interface LogoMarkProps {
  size?: keyof typeof SIZES;
  /** `glass` renders a translucent white disc for use over the brand gradient. */
  variant?: 'brand' | 'glass';
  className?: string;
}

export function LogoMark({ size = 'md', variant = 'brand', className = '' }: LogoMarkProps) {
  const bg = variant === 'glass' ? 'bg-white/15 backdrop-blur' : 'bg-brand shadow-sm';
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${SIZES[size]} ${bg} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="h-full w-full" focusable="false" aria-hidden="true">
        <path d={TOOTH_PATH} fill="#fff" fillRule="evenodd" />
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
