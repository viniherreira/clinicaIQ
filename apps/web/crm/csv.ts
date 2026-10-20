/**
 * Planilha CSV que abre direto no Excel em português: separador `;`, BOM
 * UTF-8 (acentos certos) e quebra de linha do Windows. Puro, testado em
 * `csv.test.ts`. Também lê CSV (a importação), aceitando `;` ou `,`.
 */

export type Cell = string | number | null | undefined;

const BOM = '﻿';

/**
 * Uma célula. Texto que começa com `= + - @` (ou tab/CR) ganha um `'` na
 * frente: senão o Excel trata como fórmula — um nome de lead "=HYPERLINK(…)"
 * viraria um link na planilha de quem exporta.
 */
export function csvCell(v: Cell, sep = ';'): string {
  if (v === null || v === undefined) return '';
  let t = typeof v === 'number' ? String(v).replace('.', ',') : v;
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /["\r\n]/.test(t) || t.includes(sep) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function toCsv(header: string[], rows: Cell[][], sep = ';'): string {
  const linha = (cells: Cell[]) => cells.map((c) => csvCell(c, sep)).join(sep);
  return BOM + [linha(header), ...rows.map(linha)].join('\r\n') + '\r\n';
}

/** Lê CSV com aspas (o que o Excel e o Kommo exportam). Separador: `;` ou `,`, o que aparecer mais na 1ª linha. */
export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.slice(0, t.search(/\r?\n/) === -1 ? t.length : t.search(/\r?\n/));
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let linha: string[] = [];
  let cel = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        cel += '"';
        i++;
      } else if (c === '"') aspas = false;
      else cel += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(cel);
      cel = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(cel);
      linhas.push(linha);
      linha = [];
      cel = '';
    } else cel += c;
  }
  if (cel || linha.length) {
    linha.push(cel);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((x) => x.trim() !== ''));
}
