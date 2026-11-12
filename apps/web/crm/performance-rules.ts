import type { ResponseSample } from './dashboard-math';

/**
 * As contas puras do Painel de desempenho: tempo da primeira resposta por
 * pessoa, a grade do mapa de calor e o horário de pico. Testadas em
 * `performance-rules.test.ts`; quem lê o banco é `crm/performance.ts`.
 */

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2);
}

export interface PersonSample extends ResponseSample {
  sentById: string | null;
}

/**
 * Quanto cada pessoa esperou por uma resposta de gente, e quem respondeu.
 * Do primeiro "oi" do contato até a primeira resposta pelo CRM ou pelo
 * celular da clínica; robô, automação e transmissão não contam.
 */
export function firstResponseWaits(samples: readonly PersonSample[]): { minutes: number; by: string | null }[] {
  const porConversa = new Map<string, PersonSample[]>();
  for (const s of samples) {
    const lista = porConversa.get(s.conversationId) ?? [];
    lista.push(s);
    porConversa.set(s.conversationId, lista);
  }
  const out: { minutes: number; by: string | null }[] = [];
  for (const lista of porConversa.values()) {
    lista.sort((a, b) => a.at.getTime() - b.at.getTime());
    let desde: Date | null = null;
    for (const m of lista) {
      if (m.direction === 'INBOUND') desde ??= m.at;
      else if (desde && (m.origin === 'CRM' || m.origin === 'PHONE')) {
        out.push({ minutes: (m.at.getTime() - desde.getTime()) / 60_000, by: m.sentById });
        desde = null;
      }
    }
  }
  return out;
}

/** A mediana geral e a de cada pessoa. */
export function responseMedians(samples: readonly PersonSample[]): { all: number | null; byPerson: Map<string, number> } {
  const esperas = firstResponseWaits(samples);
  const porPessoa = new Map<string, number[]>();
  for (const e of esperas) if (e.by) porPessoa.set(e.by, [...(porPessoa.get(e.by) ?? []), e.minutes]);
  const byPerson = new Map<string, number>();
  for (const [id, v] of porPessoa) byPerson.set(id, median(v)!);
  return { all: median(esperas.map((e) => e.minutes)), byPerson };
}

// ─── Quando os leads chegam ──────────────────────────────────────────────────

/** Uma linha do banco: dia da semana ISO (1 = segunda … 7 = domingo), hora e semana do mês. */
export interface ArrivalRow {
  dow: number;
  hour: number;
  week: number;
  n: number;
}

export interface Arrivals {
  /** [dia 0..6 (seg..dom)][hora 0..23] */
  grid: number[][];
  byWeekday: number[];
  /** Semana 1 a 5 do mês (dias 1–7, 8–14, 15–21, 22–28, 29–31). */
  byWeekOfMonth: number[];
  total: number;
  peak: { day: number; hour: number; n: number } | null;
}

export function buildArrivals(rows: readonly ArrivalRow[]): Arrivals {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const byWeekOfMonth = Array<number>(5).fill(0);
  for (const r of rows) {
    if (r.dow < 1 || r.dow > 7 || r.hour < 0 || r.hour > 23 || r.n <= 0) continue;
    grid[r.dow - 1][r.hour] += r.n;
    byWeekOfMonth[Math.min(5, Math.max(1, r.week)) - 1] += r.n;
  }
  const byWeekday = grid.map((d) => d.reduce((s, v) => s + v, 0));
  let peak: Arrivals['peak'] = null;
  grid.forEach((dia, d) => dia.forEach((n, h) => (n > 0 && (!peak || n > peak.n) ? (peak = { day: d, hour: h, n }) : null)));
  return { grid, byWeekday, byWeekOfMonth, total: byWeekday.reduce((s, v) => s + v, 0), peak };
}

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** "Quinta, das 10h às 11h" */
export const peakText = (p: { day: number; hour: number }) => `${WEEKDAYS[p.day]}, das ${p.hour}h às ${p.hour + 1}h`;

/** Os últimos N meses até o mês de `today` ("AAAA-MM-DD"), do mais antigo ao atual: "AAAA-MM". */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-11" → { tick: "nov", label: "novembro de 2026" curto: "nov/26" } */
export function monthLabel(ym: string): { tick: string; label: string } {
  const [y, m] = [ym.slice(0, 4), Number(ym.slice(5, 7))];
  return { tick: MESES[m - 1] ?? ym, label: `${MESES[m - 1] ?? ym}/${y.slice(2)}` };
}
