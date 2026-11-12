import { addDays, clinicDay, dayStart, monthEnd, monthStart } from './period';

/**
 * O período das telas de números (Anúncios e Painel): os dias, o período
 * anterior de mesmo tamanho para comparar, e os dias um a um para os gráficos.
 * Puro; dias no horário da clínica (Brasília).
 */

export type ReportPeriodKey = 'hoje' | '7d' | '30d' | 'mes' | 'mes_passado' | '90d';

export const REPORT_PERIODS: { key: ReportPeriodKey; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'mes_passado', label: 'Mês passado' },
  { key: '90d', label: '90 dias' },
];

export const DEFAULT_REPORT_PERIOD: ReportPeriodKey = '30d';

export const asReportPeriod = (v: string | undefined): ReportPeriodKey =>
  REPORT_PERIODS.some((p) => p.key === v) ? (v as ReportPeriodKey) : DEFAULT_REPORT_PERIOD;

export interface DayRange {
  /** Primeiro e último dia, "AAAA-MM-DD", os dois dentro do período. */
  since: string;
  until: string;
  /** Os mesmos limites como instantes: `from` incluso, `to` excluso. */
  from: Date;
  to: Date;
}

const range = (since: string, until: string): DayRange => ({
  since,
  until,
  from: dayStart(since),
  to: dayStart(addDays(until, 1)),
});

/** Quantos dias o período tem (os dois extremos contam). */
export function dayCount(r: Pick<DayRange, 'since' | 'until'>): number {
  return Math.round((dayStart(r.until).getTime() - dayStart(r.since).getTime()) / 86_400_000) + 1;
}

/** Todos os dias do período, em ordem. */
export function daysOf(r: Pick<DayRange, 'since' | 'until'>): string[] {
  const n = dayCount(r);
  return Array.from({ length: n }, (_, i) => addDays(r.since, i));
}

/**
 * O período escolhido e o anterior, para a comparação. "Este mês" compara com
 * os mesmos dias do mês passado (dia 1 ao dia 11 contra dia 1 ao dia 11); os
 * outros, com o trecho de mesmo tamanho logo antes.
 */
export function reportRange(key: ReportPeriodKey, now: Date = new Date()): { current: DayRange; previous: DayRange } {
  const hoje = clinicDay(now);
  if (key === 'mes') {
    const inicio = monthStart(hoje);
    const fimAnterior = addDays(inicio, -1);
    const inicioAnterior = monthStart(fimAnterior);
    const mesmoDia = addDays(inicioAnterior, dayCount({ since: inicio, until: hoje }) - 1);
    return { current: range(inicio, hoje), previous: range(inicioAnterior, mesmoDia < fimAnterior ? mesmoDia : fimAnterior) };
  }
  if (key === 'mes_passado') {
    const fim = addDays(monthStart(hoje), -1);
    const fimAntes = addDays(monthStart(fim), -1);
    return { current: range(monthStart(fim), monthEnd(fim)), previous: range(monthStart(fimAntes), fimAntes) };
  }
  const dias = key === 'hoje' ? 1 : key === '7d' ? 7 : key === '30d' ? 30 : 90;
  const since = addDays(hoje, -(dias - 1));
  return { current: range(since, hoje), previous: range(addDays(since, -dias), addDays(since, -1)) };
}

/** Com o que o período é comparado, por extenso. */
export const PREVIOUS_LABEL: Record<ReportPeriodKey, string> = {
  hoje: 'ontem',
  '7d': 'os 7 dias anteriores',
  '30d': 'os 30 dias anteriores',
  mes: 'os mesmos dias do mês passado',
  mes_passado: 'o mês anterior',
  '90d': 'os 90 dias anteriores',
};

export interface Bucket {
  /** Primeiro e último dia do grupo. */
  since: string;
  until: string;
  /** "12/11" (um dia) ou "12/11 a 18/11" (vários). */
  label: string;
  /** Rótulo curto do eixo: "12/11". */
  tick: string;
}

const curto = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * Junta os dias em grupos iguais para caber no gráfico: até `max` barras.
 * 30 dias com max 31 ficam um a um; 90 dias viram semanas.
 */
export function bucketDays(days: readonly string[], max: number): Bucket[] {
  if (days.length === 0) return [];
  const tamanho = Math.max(1, Math.ceil(days.length / max));
  const out: Bucket[] = [];
  for (let i = 0; i < days.length; i += tamanho) {
    const grupo = days.slice(i, i + tamanho);
    const [a, b] = [grupo[0], grupo[grupo.length - 1]];
    out.push({ since: a, until: b, label: a === b ? curto(a) : `${curto(a)} a ${curto(b)}`, tick: curto(a) });
  }
  return out;
}

/** Soma uma série por dia dentro dos grupos de `bucketDays`. */
export function sumByBucket(buckets: readonly Bucket[], byDay: ReadonlyMap<string, number>): number[] {
  return buckets.map((b) => {
    let total = 0;
    for (const [day, v] of byDay) if (day >= b.since && day <= b.until) total += v;
    return total;
  });
}
