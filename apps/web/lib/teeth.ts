/**
 * Dentes na numeração FDI (a usada no Brasil): o primeiro dígito é o
 * quadrante (1 superior direito, 2 superior esquerdo, 3 inferior esquerdo,
 * 4 inferior direito), o segundo vai do incisivo central (1) ao terceiro
 * molar (8). Puro e testado em `teeth.test.ts`.
 *
 * No orçamento, os dentes escolhidos viram o texto do item ("Dentes 11, 21")
 * e a quantidade — uma restauração por dente.
 */

/** Como o dentista vê a boca do paciente: a direita dele fica à esquerda da tela. */
export const UPPER_ROW = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_ROW = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const TODOS = new Set([...UPPER_ROW, ...LOWER_ROW]);

const NOMES = ['', 'incisivo central', 'incisivo lateral', 'canino', '1º pré-molar', '2º pré-molar', '1º molar', '2º molar', '3º molar'];
const QUADRANTES = ['', 'superior direito', 'superior esquerdo', 'inferior esquerdo', 'inferior direito'];

/** "11 — incisivo central superior direito", para leitor de tela e dica. */
export function toothName(n: number): string {
  return `${n} — ${NOMES[n % 10]} ${QUADRANTES[Math.floor(n / 10)]}`;
}

/** Em ordem de quadrante e dente: "Dente 11", "Dentes 11, 21 e 36". */
export function teethLabel(teeth: number[]): string {
  const lista = [...new Set(teeth.filter((t) => TODOS.has(t)))].sort((a, b) => a - b);
  if (lista.length === 0) return '';
  if (lista.length === 1) return `Dente ${lista[0]}`;
  return `Dentes ${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}`;
}

/** Lê de volta o texto que `teethLabel` escreveu; outro texto qualquer não vira dente. */
export function parseTeeth(text: string): number[] {
  const m = /^Dentes? ([\d, e]+)$/.exec(text.trim());
  if (!m) return [];
  const nums = m[1].split(/,|\se\s/).map((x) => Number(x.trim()));
  return nums.every((n) => TODOS.has(n)) ? nums : [];
}
