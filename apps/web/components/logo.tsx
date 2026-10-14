/**
 * Logo do DreamClin, em SVG desenhado no próprio componente (nítido em qualquer
 * tamanho). O desenho mora em `logo-paths.ts`.
 *
 * No tema claro, a logo vai colorida. No escuro e no CRM (que é sempre escuro),
 * vai a versão clara do manual: tudo branco, com a cabeça em branco translúcido.
 * Sobre o degradê da marca, use `tone="white"`.
 */
import {
  SYMBOL_BODY,
  SYMBOL_D,
  SYMBOL_HEAD,
  SYMBOL_STAR,
  SYMBOL_STAR_STROKE,
  SYMBOL_VIEWBOX,
  WORDMARK_CLIN,
  WORDMARK_DREAM,
} from './logo-paths';

type Tone = 'auto' | 'white';

const FILL = {
  auto: {
    d: 'fill-brand dark:fill-white',
    body: 'fill-brand-navy dark:fill-white',
    head: 'fill-brand-mint dark:fill-white/45',
    star: 'fill-brand stroke-brand dark:fill-white dark:stroke-white',
    dream: 'fill-brand-navy dark:fill-white',
    clin: 'fill-brand dark:fill-white',
  },
  white: {
    d: 'fill-white',
    body: 'fill-white',
    head: 'fill-white/45',
    star: 'fill-white stroke-white',
    dream: 'fill-white',
    clin: 'fill-white',
  },
} as const;

/** Altura do símbolo; a largura acompanha (o símbolo é 1,12× mais largo que alto). */
const SIZES = {
  xs: 'h-4',
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-12',
} as const;

type Size = keyof typeof SIZES;

function SymbolShapes({ tone }: { tone: Tone }) {
  const f = FILL[tone];
  return (
    <>
      <path className={f.d} d={SYMBOL_D} />
      <path className={f.body} d={SYMBOL_BODY} />
      <circle className={f.head} cx={SYMBOL_HEAD.cx} cy={SYMBOL_HEAD.cy} r={SYMBOL_HEAD.r} />
      <path className={f.star} strokeWidth={SYMBOL_STAR_STROKE} strokeLinejoin="round" d={SYMBOL_STAR} />
    </>
  );
}

interface LogoMarkProps {
  size?: Size;
  tone?: Tone;
  className?: string;
}

/** Só o símbolo. Decorativo: quem usa dá o nome por perto (texto ou `sr-only`). */
export function LogoMark({ size = 'md', tone = 'auto', className = '' }: LogoMarkProps) {
  return (
    <svg
      viewBox={SYMBOL_VIEWBOX}
      className={`w-auto shrink-0 ${SIZES[size]} ${className}`}
      focusable="false"
      aria-hidden="true"
    >
      <SymbolShapes tone={tone} />
    </svg>
  );
}

interface LogoProps {
  size?: Size;
  tone?: Tone;
  className?: string;
}

/**
 * A logo horizontal (a principal do manual): símbolo e nome. As proporções são
 * as do manual: a maiúscula do nome tem 52% da altura do símbolo, a linha de
 * base fica a 78,5% e o espaço entre os dois é de 15%.
 */
export function Logo({ size = 'md', tone = 'auto', className = '' }: LogoProps) {
  const f = FILL[tone];
  // Símbolo de 565,5 de altura; o nome entra escalado a 4,19× (maiúscula de 70,6).
  return (
    <svg
      viewBox="0 0 2675.5 565.5"
      className={`w-auto shrink-0 ${SIZES[size]} ${className}`}
      role="img"
      aria-label="DreamClin"
      focusable="false"
    >
      <g transform="translate(-5 -2.5)">
        <SymbolShapes tone={tone} />
      </g>
      <g transform="translate(722.6 443.9) scale(4.19)">
        <g transform="translate(-6.8 0)">
          <path className={f.dream} d={WORDMARK_DREAM} />
          <path className={f.clin} d={WORDMARK_CLIN} />
        </g>
      </g>
    </svg>
  );
}
