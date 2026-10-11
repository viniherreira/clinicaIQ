import { CLINIC_TZ } from '@/lib/tz';

/**
 * As contas do Painel do CRM, sem banco: período, conversão, tempo de resposta
 * e agrupamentos. Testadas por tabela em `dashboard-math.test.ts`.
 */

export type PeriodKey = '7d' | '30d' | '90d' | 'mes';
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'mes', label: 'Este mês' },
];

export const asPeriod = (v: string | undefined): PeriodKey =>
  PERIODS.some((p) => p.key === v) ? (v as PeriodKey) : '30d';

const DAY = 86_400_000;

/**
 * Início do período. "Este mês" começa à meia-noite do dia 1 no horário da
 * clínica (Brasília, UTC−3, sem horário de verão desde 2019).
 */
export function periodStart(key: PeriodKey, now: Date = new Date()): Date {
  if (key === 'mes') {
    const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit' })
      .format(now)
      .split('-');
    return new Date(`${y}-${m}-01T03:00:00.000Z`);
  }
  const dias = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  return new Date(now.getTime() - dias * DAY);
}

/** Ganhos sobre os fechados (ganhos + perdidos). Sem fechados, não há taxa. */
export function conversionRate(won: number, lost: number): number | null {
  const fechados = won + lost;
  return fechados === 0 ? null : won / fechados;
}

export interface ResponseSample {
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  origin: string;
  at: Date;
}

/**
 * Quanto a equipe demora para responder, em minutos (mediana).
 *
 * Conta do primeiro "oi" do contato até a primeira resposta de gente — pelo
 * CRM ou pelo celular da clínica. Robô, automação e transmissão não contam: o
 * que interessa é quanto tempo a pessoa esperou alguém da clínica. A mediana
 * não deixa uma conversa esquecida no fim de semana distorcer o número.
 */
export function medianFirstResponseMinutes(samples: readonly ResponseSample[]): number | null {
  const porConversa = new Map<string, ResponseSample[]>();
  for (const s of samples) {
    const lista = porConversa.get(s.conversationId) ?? [];
    lista.push(s);
    porConversa.set(s.conversationId, lista);
  }
  const esperas: number[] = [];
  for (const lista of porConversa.values()) {
    lista.sort((a, b) => a.at.getTime() - b.at.getTime());
    let desde: Date | null = null;
    for (const m of lista) {
      if (m.direction === 'INBOUND') {
        desde ??= m.at;
      } else if (desde && (m.origin === 'CRM' || m.origin === 'PHONE')) {
        esperas.push((m.at.getTime() - desde.getTime()) / 60_000);
        desde = null;
      }
    }
  }
  if (esperas.length === 0) return null;
  esperas.sort((a, b) => a - b);
  const meio = Math.floor(esperas.length / 2);
  const mediana = esperas.length % 2 ? esperas[meio] : (esperas[meio - 1] + esperas[meio]) / 2;
  return Math.round(mediana);
}

/** "12 min", "3 h 05", "2 dias". */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  }
  const dias = Math.round(min / (24 * 60));
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

/** Conta por chave, do maior para o menor (empate: ordem alfabética). */
export function countBy<T>(items: readonly T[], key: (t: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'pt-BR'));
}

/** Percentual inteiro para mostrar: 0,333 → "33%". */
export const pct = (v: number) => `${Math.round(v * 100)}%`;
