/**
 * O odontograma: dentes (notação FDI), faces e o catálogo de marcações.
 * Puro — a ficha (cliente), as ações (servidor) e o orçamento usam o mesmo.
 *
 * Convenção de cores das fichas odontológicas: vermelho é o que falta fazer,
 * azul o que foi feito na clínica, e cinza o que o paciente já tinha.
 */

export const PERM_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const PERM_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const DECID_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const DECID_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

/** Permanentes (quadrantes 1-4, dentes 1-8) e decíduos (5-8, dentes 1-5). */
export const VALID_TEETH = new Set([
  ...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => q * 10 + n)),
  ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((n) => q * 10 + n)),
]);

export type Face = 'M' | 'D' | 'O' | 'V' | 'L';
export const FACES: readonly Face[] = ['V', 'M', 'O', 'D', 'L'];

export type FindingStatus = 'PLANNED' | 'DONE' | 'EXISTING';
export const STATUS_LABEL: Record<FindingStatus, string> = {
  PLANNED: 'A fazer',
  DONE: 'Realizado',
  EXISTING: 'Pré-existente',
};

export type FindingKind =
  | 'CARIES'
  | 'RESTORATION'
  | 'SEALANT'
  | 'ROOT_CANAL'
  | 'CROWN'
  | 'IMPLANT'
  | 'EXTRACTION'
  | 'MISSING'
  | 'BRIDGE'
  | 'VENEER'
  | 'FRACTURE'
  | 'NOTE';

export interface KindMeta {
  label: string;
  /** Marca faces (cárie, restauração, selante); as outras valem para o dente todo. */
  faces: boolean;
  /** Situação que já vem marcada ao escolher. */
  defaultStatus: FindingStatus;
  /** Ajuda curta no botão. */
  hint: string;
}

export const KINDS: Record<FindingKind, KindMeta> = {
  CARIES: { label: 'Cárie', faces: true, defaultStatus: 'PLANNED', hint: 'Lesão a tratar nas faces' },
  RESTORATION: { label: 'Restauração', faces: true, defaultStatus: 'PLANNED', hint: 'Resina, amálgama, ionômero' },
  SEALANT: { label: 'Selante', faces: true, defaultStatus: 'PLANNED', hint: 'Fóssulas e fissuras' },
  ROOT_CANAL: { label: 'Tratamento de canal', faces: false, defaultStatus: 'PLANNED', hint: 'Endodontia' },
  CROWN: { label: 'Coroa', faces: false, defaultStatus: 'PLANNED', hint: 'Prótese unitária' },
  IMPLANT: { label: 'Implante', faces: false, defaultStatus: 'PLANNED', hint: 'Implante osseointegrado' },
  EXTRACTION: { label: 'Extração', faces: false, defaultStatus: 'PLANNED', hint: 'Exodontia' },
  MISSING: { label: 'Ausente', faces: false, defaultStatus: 'EXISTING', hint: 'O dente não está na boca' },
  BRIDGE: { label: 'Prótese / ponte', faces: false, defaultStatus: 'PLANNED', hint: 'Prótese fixa ou removível' },
  VENEER: { label: 'Faceta', faces: false, defaultStatus: 'PLANNED', hint: 'Lente ou faceta de resina' },
  FRACTURE: { label: 'Fratura', faces: false, defaultStatus: 'PLANNED', hint: 'Trinca ou fratura' },
  NOTE: { label: 'Anotação', faces: false, defaultStatus: 'EXISTING', hint: 'Observação sobre o dente' },
};
export const KIND_ORDER = Object.keys(KINDS) as FindingKind[];

export const isKind = (k: string): k is FindingKind => k in KINDS;
export const isFace = (f: string): f is Face => (FACES as readonly string[]).includes(f);

const quadrant = (fdi: number) => Math.floor(fdi / 10);
export const isUpper = (fdi: number) => [1, 2, 5, 6].includes(quadrant(fdi));
export const isDeciduous = (fdi: number) => quadrant(fdi) >= 5;
/** Incisivos e caninos: a face de cima é a incisal, não a oclusal. */
export const isAnterior = (fdi: number) => fdi % 10 <= 3;
/** Lado direito do paciente (quadrantes 1, 4, 5 e 8): na ficha, fica à esquerda. */
export const isPatientRight = (fdi: number) => [1, 4, 5, 8].includes(quadrant(fdi));

const NOMES_PERM = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', '1º pré-molar', '2º pré-molar', '1º molar', '2º molar', '3º molar (siso)'];
const NOMES_DECID = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', '1º molar', '2º molar'];

/** "1º molar inferior esquerdo", "Canino superior direito (decíduo)". */
export function toothName(fdi: number): string {
  const n = fdi % 10;
  const base = (isDeciduous(fdi) ? NOMES_DECID : NOMES_PERM)[n] ?? `Dente ${fdi}`;
  const lado = isPatientRight(fdi) ? 'direito' : 'esquerdo';
  return `${base} ${isUpper(fdi) ? 'superior' : 'inferior'} ${lado}${isDeciduous(fdi) ? ' (decíduo)' : ''}`;
}

/** O nome da face neste dente: oclusal ou incisal; lingual ou palatina. */
export function faceName(face: Face, fdi: number): string {
  switch (face) {
    case 'M':
      return 'Mesial';
    case 'D':
      return 'Distal';
    case 'V':
      return 'Vestibular';
    case 'O':
      return isAnterior(fdi) ? 'Incisal' : 'Oclusal';
    case 'L':
      return isUpper(fdi) ? 'Palatina' : 'Lingual';
  }
}

/** A letra da face neste dente (I para incisal, P para palatina). */
export function faceLetter(face: Face, fdi: number): string {
  if (face === 'O' && isAnterior(fdi)) return 'I';
  if (face === 'L' && isUpper(fdi)) return 'P';
  return face;
}

/** "MOD", na ordem em que se escreve na ficha. */
export function facesText(faces: readonly string[], fdi: number): string {
  return ['M', 'O', 'D', 'V', 'L']
    .filter((f) => faces.includes(f))
    .map((f) => faceLetter(f as Face, fdi))
    .join('');
}

export interface FindingLike {
  toothNumber: number;
  kind: string;
  surfaces: readonly string[];
  status: FindingStatus;
}

/** "Restauração MO no dente 36". */
export function findingText(f: Pick<FindingLike, 'toothNumber' | 'kind' | 'surfaces'>): string {
  const label = isKind(f.kind) ? KINDS[f.kind].label : f.kind;
  const faces = facesText(f.surfaces, f.toothNumber);
  return `${label}${faces ? ` ${faces}` : ''} no dente ${f.toothNumber}`;
}

/** O que mais pede atenção vem primeiro: a fazer, depois feito, depois o que já tinha. */
const PESO: Record<FindingStatus, number> = { PLANNED: 3, DONE: 2, EXISTING: 1 };
const maisImportante = (a: FindingStatus | undefined, b: FindingStatus) => (!a || PESO[b] > PESO[a] ? b : a);

/** Como desenhar um dente: a cor de cada face e as marcas do dente todo. */
export interface ToothVisual {
  faces: Partial<Record<Face, FindingStatus>>;
  whole: Partial<Record<Exclude<FindingKind, 'CARIES' | 'RESTORATION' | 'SEALANT'>, FindingStatus>>;
  /** A situação mais urgente do dente (para o número e a leitura de tela). */
  top?: FindingStatus;
  count: number;
}

export function toothVisual(findings: readonly FindingLike[]): ToothVisual {
  const v: ToothVisual = { faces: {}, whole: {}, count: findings.length };
  for (const f of findings) {
    v.top = maisImportante(v.top, f.status);
    if (!isKind(f.kind)) continue;
    if (KINDS[f.kind].faces) {
      for (const face of f.surfaces) if (isFace(face)) v.faces[face] = maisImportante(v.faces[face], f.status);
    } else {
      const k = f.kind as keyof ToothVisual['whole'];
      v.whole[k] = maisImportante(v.whole[k], f.status);
    }
  }
  return v;
}

/** Dente que saiu da boca (extraído ou ausente): desenhado apagado. */
export function toothGone(v: ToothVisual): boolean {
  return v.whole.MISSING !== undefined || v.whole.EXTRACTION === 'DONE' || v.whole.EXTRACTION === 'EXISTING';
}
