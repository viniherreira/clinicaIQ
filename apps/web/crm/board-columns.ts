/**
 * O quadro carrega cada coluna aos poucos (como no Kommo): os primeiros cards
 * vêm com a página e, rolando até o fim de uma coluna, vêm mais. Estas são as
 * regras puras dessa carga; a tela fica em `_components/board.tsx`.
 */

/** Pede de novo alguns cards já vistos: se algo mudou de lugar no meio, nenhum fica de fora. */
export const LOAD_OVERLAP = 5;

/** De onde pedir a próxima leva de uma coluna que já mostra `carregados` cards. */
export const nextSkip = (carregados: number) => Math.max(0, carregados - LOAD_OVERLAP);

/** Junta a leva nova no fim, sem repetir card e só com os que ainda são da coluna. */
export function appendColumn<T extends { id: string; stageId: string }>(atuais: readonly T[], novos: readonly T[], stageId: string) {
  const tem = new Set(atuais.map((l) => l.id));
  const entram = novos.filter((l) => l.stageId === stageId && !tem.has(l.id));
  return { leads: entram.length ? [...atuais, ...entram] : [...atuais], added: entram.length };
}

/**
 * A página voltou do servidor (mover, lead novo, atualização automática): vale
 * o que veio, mais os cards que a pessoa já tinha carregado rolando nas colunas
 * abertas. Card que veio do servidor ganha do que estava na tela.
 */
export function mergeRefresh<T extends { id: string; stageId: string }>(
  doServidor: readonly T[],
  naTela: readonly T[],
  abertas: ReadonlySet<string>,
): T[] {
  if (abertas.size === 0) return [...doServidor];
  const veio = new Set(doServidor.map((l) => l.id));
  return [...doServidor, ...naTela.filter((l) => !veio.has(l.id) && abertas.has(l.stageId))];
}

export interface ColumnTotals {
  count: number;
  valueCents: number;
}

/** O que muda nas contas das colunas quando um card sai de uma e entra em outra (ou em nenhuma). */
export function shiftTotals(
  ajustes: Readonly<Record<string, ColumnTotals>>,
  de: string,
  para: string | null,
  valueCents: number,
): Record<string, ColumnTotals> {
  const n = { ...ajustes };
  const mexe = (id: string, sinal: 1 | -1) => {
    const a = n[id] ?? { count: 0, valueCents: 0 };
    n[id] = { count: a.count + sinal, valueCents: a.valueCents + sinal * valueCents };
  };
  if (de === para) return n;
  mexe(de, -1);
  if (para) mexe(para, 1);
  return n;
}

/** A conta da coluna: a do servidor mais o que já mudou na tela e o servidor ainda não confirmou. */
export function columnTotals(
  stats: Readonly<Record<string, ColumnTotals>>,
  ajustes: Readonly<Record<string, ColumnTotals>>,
  stageId: string,
): ColumnTotals {
  const s = stats[stageId] ?? { count: 0, valueCents: 0 };
  const a = ajustes[stageId] ?? { count: 0, valueCents: 0 };
  return { count: Math.max(0, s.count + a.count), valueCents: s.valueCents + a.valueCents };
}
