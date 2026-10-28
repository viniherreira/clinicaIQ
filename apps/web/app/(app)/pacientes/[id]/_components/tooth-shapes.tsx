'use client';

import { isPatientRight, isUpper, toothGone, type Face, type FindingStatus, type ToothVisual } from '@/lib/odontogram';

/**
 * O desenho de cada dente no odontograma, no estilo das fichas clínicas:
 * a vista lateral (coroa e raízes, com os símbolos de canal, implante, coroa,
 * faceta, fratura, extração e prótese) e a vista de cima, com as cinco faces
 * pintadas. SVG puro: as cores vêm de classes, e funcionam no tema escuro.
 */

export type ToothType = 'incisor' | 'canine' | 'premolar' | 'premolar2r' | 'molar';

/** Número FDI → tipo anatômico (permanentes 1-4, decíduos 5-8). */
export function toothTypeOf(fdi: number): ToothType {
  const quadrant = Math.floor(fdi / 10);
  const pos = fdi % 10;
  if (pos <= 2) return 'incisor';
  if (pos === 3) return 'canine';
  if (quadrant >= 5) return 'molar';
  if (pos === 4) return quadrant === 1 || quadrant === 2 ? 'premolar2r' : 'premolar';
  if (pos === 5) return 'premolar';
  return 'molar';
}

/** Cor de cada situação: vermelho a fazer, azul feito, cinza já tinha. */
export const STATUS_FILL: Record<FindingStatus, string> = {
  PLANNED: 'fill-red-500',
  DONE: 'fill-blue-600 dark:fill-blue-500',
  EXISTING: 'fill-slate-500 dark:fill-slate-400',
};
export const STATUS_STROKE: Record<FindingStatus, string> = {
  PLANNED: 'stroke-red-500',
  DONE: 'stroke-blue-600 dark:stroke-blue-500',
  EXISTING: 'stroke-slate-500 dark:stroke-slate-400',
};
export const STATUS_DOT: Record<FindingStatus, string> = {
  PLANNED: 'bg-red-500',
  DONE: 'bg-blue-600 dark:bg-blue-500',
  EXISTING: 'bg-slate-500 dark:bg-slate-400',
};

const BODY = 'fill-white stroke-slate-400 dark:fill-slate-200/10 dark:stroke-slate-500';

/**
 * Desenhado com a raiz para cima e a coroa para baixo (arcada superior); a
 * inferior espelha. viewBox 40×64; a coroa ocupa y 32–61.
 */
const CROWN: Record<ToothType, string> = {
  incisor: 'M13 34 C13 32 27 32 27 34 L28 50 C28 57 24 60 20 60 C16 60 12 57 12 50 Z',
  canine: 'M12 34 C12 32 28 32 28 34 L28 47 C28 52 23 58 20 61 C17 58 12 52 12 47 Z',
  premolar: 'M10 34 C10 32 30 32 30 34 L31 48 C31 56 26 60 20 60 C14 60 9 56 9 48 Z',
  premolar2r: 'M10 34 C10 32 30 32 30 34 L31 48 C31 56 26 60 20 60 C14 60 9 56 9 48 Z',
  molar: 'M6 34 C6 32 34 32 34 34 L35 47 C35 55 31 60 27 59 C24 61 22 58 20 59 C18 58 16 61 13 59 C9 60 5 55 5 47 Z',
};
const VENEER: Record<ToothType, string> = {
  incisor: 'M15 37 L25 37 L25.5 50 C25.5 55 23 57 20 57 C17 57 14.5 55 14.5 50 Z',
  canine: 'M15 37 L25 37 L25 47 C25 51 22 55 20 57 C18 55 15 51 15 47 Z',
  premolar: 'M13 37 L27 37 L28 48 C28 54 24 57 20 57 C16 57 12 54 12 48 Z',
  premolar2r: 'M13 37 L27 37 L28 48 C28 54 24 57 20 57 C16 57 12 54 12 48 Z',
  molar: 'M9 37 L31 37 L32 47 C32 53 28 57 20 57 C12 57 8 53 8 47 Z',
};

function roots(type: ToothType, upper: boolean): { shapes: string[]; canals: string[] } {
  switch (type) {
    case 'incisor':
      return { shapes: ['M14 35 C15 22 18 8 20 4 C22 8 25 22 26 35 Z'], canals: ['M20 9 L20 40'] };
    case 'canine':
      return { shapes: ['M14 35 C14 20 18 6 20 1 C22 6 26 20 26 35 Z'], canals: ['M20 6 L20 40'] };
    case 'premolar':
      return { shapes: ['M13 35 C14 22 18 9 20 5 C22 9 26 22 27 35 Z'], canals: ['M20 10 L20 40'] };
    case 'premolar2r':
      return {
        shapes: ['M12 35 C12 24 13 12 15 6 C17 12 19 24 20 35 Z', 'M20 35 C21 24 23 12 25 6 C27 12 28 24 28 35 Z'],
        canals: ['M15.5 11 L16.5 40', 'M24.5 11 L23.5 40'],
      };
    case 'molar':
      return upper
        ? {
            shapes: [
              'M7 35 C6 24 8 14 10 7 C13 14 14 24 15 35 Z',
              'M16 35 C17 22 19 12 20 6 C21 12 23 22 24 35 Z',
              'M25 35 C26 24 28 14 30 7 C32 14 34 24 33 35 Z',
            ],
            canals: ['M10.5 12 L12 40', 'M20 11 L20 40', 'M29.5 12 L28 40'],
          }
        : {
            shapes: ['M7 35 C7 23 9 13 12 6 C15 13 17 23 18 35 Z', 'M22 35 C23 23 25 13 28 6 C31 13 33 23 33 35 Z'],
            canals: ['M12.5 11 L14 40', 'M27.5 11 L26 40'],
          };
  }
}

const tone = (s: FindingStatus | undefined) => (s ? STATUS_STROKE[s] : '');

/** A vista lateral do dente, com as marcas do dente todo. */
export function ToothSide({ fdi, visual, className }: { fdi: number; visual: ToothVisual; className?: string }) {
  const type = toothTypeOf(fdi);
  const upper = isUpper(fdi);
  const w = visual.whole;
  const gone = toothGone(visual);
  const { shapes, canals } = roots(type, upper);

  return (
    <svg viewBox="0 0 40 64" className={className} aria-hidden="true" focusable="false">
      <g transform={upper ? undefined : 'translate(0 64) scale(1 -1)'}>
        <g opacity={gone ? 0.22 : 1} strokeDasharray={w.MISSING ? '2.5 2' : undefined}>
          {w.IMPLANT ? (
            // Implante no lugar da raiz: o parafuso com as roscas.
            <g className={tone(w.IMPLANT)} strokeWidth="1.4" fill="none">
              <path d="M15 34 L16 9 Q20 4 24 9 L25 34 Z" className={STATUS_FILL[w.IMPLANT]} fillOpacity={0.25} />
              {[13, 17.5, 22, 26.5, 31].map((y) => (
                <path key={y} d={`M14.5 ${y} L25.5 ${y - 2}`} />
              ))}
            </g>
          ) : (
            shapes.map((d) => <path key={d} d={d} strokeWidth="1.2" strokeLinejoin="round" className={BODY} />)
          )}
          <path
            d={CROWN[type]}
            strokeWidth={w.CROWN ? 2.6 : 1.3}
            strokeLinejoin="round"
            fillOpacity={w.CROWN ? 0.3 : undefined}
            className={w.CROWN ? `${STATUS_STROKE[w.CROWN]} ${STATUS_FILL[w.CROWN]}` : BODY}
          />
          {w.VENEER && <path d={VENEER[type]} fillOpacity={0.6} className={STATUS_FILL[w.VENEER]} />}
          {w.ROOT_CANAL && !w.IMPLANT && (
            <g strokeWidth="2.4" strokeLinecap="round" className={STATUS_STROKE[w.ROOT_CANAL]}>
              {canals.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
          )}
          {w.FRACTURE && (
            <path d="M14 40 L19.5 44 L16 48.5 L23 53" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={STATUS_STROKE[w.FRACTURE]} />
          )}
        </g>
        {w.BRIDGE && (
          // Vai de ponta a ponta: dentes vizinhos com prótese ficam ligados.
          <path d="M0 33 L40 33" strokeWidth="3.2" className={STATUS_STROKE[w.BRIDGE]} />
        )}
      </g>
      {w.EXTRACTION && (
        <g strokeWidth="3" strokeLinecap="round" className={STATUS_STROKE[w.EXTRACTION]}>
          <path d="M8 8 L32 56" />
          <path d="M32 8 L8 56" />
        </g>
      )}
    </svg>
  );
}

/** Onde cada face fica no desenho de cima (vestibular para fora da boca, mesial para o meio). */
export function facePositions(fdi: number): { top: Face; right: Face; bottom: Face; left: Face } {
  const upper = isUpper(fdi);
  const right = isPatientRight(fdi);
  return {
    top: upper ? 'V' : 'L',
    bottom: upper ? 'L' : 'V',
    right: right ? 'M' : 'D',
    left: right ? 'D' : 'M',
  };
}

export const SECTORS = {
  top: 'M7.27 7.27 A18 18 0 0 1 32.73 7.27 L24.95 15.05 A7 7 0 0 0 15.05 15.05 Z',
  right: 'M32.73 7.27 A18 18 0 0 1 32.73 32.73 L24.95 24.95 A7 7 0 0 0 24.95 15.05 Z',
  bottom: 'M32.73 32.73 A18 18 0 0 1 7.27 32.73 L15.05 24.95 A7 7 0 0 0 24.95 24.95 Z',
  left: 'M7.27 32.73 A18 18 0 0 1 7.27 7.27 L15.05 15.05 A7 7 0 0 0 15.05 24.95 Z',
} as const;

/**
 * A vista de cima, com as cinco faces. `data-face` em cada uma: clicar numa
 * face no quadro já escolhe o dente com aquela face.
 */
export function ToothTop({
  fdi,
  faces,
  selected = [],
  gone,
  className,
  onFace,
}: {
  fdi: number;
  faces: ToothVisual['faces'];
  /** Faces escolhidas no painel (contorno destacado). */
  selected?: readonly Face[];
  gone?: boolean;
  className?: string;
  onFace?: (face: Face) => void;
}) {
  const pos = facePositions(fdi);
  const cls = (face: Face) => {
    const s = faces[face];
    const sel = selected.includes(face);
    return [
      s ? `${STATUS_FILL[s]} stroke-white dark:stroke-slate-900` : 'fill-white stroke-slate-400 dark:fill-slate-200/10 dark:stroke-slate-500',
      sel ? '!stroke-primary [stroke-width:2.6]' : '',
      onFace ? 'cursor-pointer hover:opacity-80' : '',
    ].join(' ');
  };
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false" opacity={gone ? 0.25 : 1}>
      {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
        <path key={k} d={SECTORS[k]} data-face={pos[k]} strokeWidth="1.1" className={cls(pos[k])} onClick={onFace ? () => onFace(pos[k]) : undefined} />
      ))}
      <circle cx="20" cy="20" r="7" data-face="O" strokeWidth="1.1" className={cls('O')} onClick={onFace ? () => onFace('O') : undefined} />
    </svg>
  );
}
