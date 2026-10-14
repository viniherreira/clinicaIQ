import type { Prisma } from '@clinicaiq/db';

/**
 * Período por data, como no Kommo: os leads criados (ou fechados) entre dois
 * dias. Serve à busca de leads e ao público das transmissões.
 *
 * Os atalhos (hoje, últimos 7 dias…) são relativos: um link salvo com "últimos
 * 7 dias" continua valendo amanhã. O calendário dá dias fixos.
 *
 * Dia = "AAAA-MM-DD" no horário da clínica (Brasília, sem horário de verão),
 * sempre inclusivo dos dois lados. Puro: roda no servidor e na tela.
 */

/** Qual data conta: quando o lead entrou ou quando foi ganho ou perdido. */
export type PeriodField = 'criado' | 'fechado';
export type PeriodPreset = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'mes-passado' | 'ano';

export interface Period {
  field: PeriodField;
  /** Atalho relativo a hoje. Vazio quando o período veio do calendário. */
  preset: PeriodPreset | '';
  /** Do calendário. Um lado vazio = sem limite daquele lado. */
  from: string;
  to: string;
}

export const NO_PERIOD: Period = { field: 'criado', preset: '', from: '', to: '' };

export const PERIOD_PRESETS: readonly { v: PeriodPreset; label: string }[] = [
  { v: 'hoje', label: 'Hoje' },
  { v: 'ontem', label: 'Ontem' },
  { v: '7d', label: 'Últimos 7 dias' },
  { v: '30d', label: 'Últimos 30 dias' },
  { v: 'mes', label: 'Este mês' },
  { v: 'mes-passado', label: 'Mês passado' },
  { v: 'ano', label: 'Este ano' },
];

export const FIELD_LABEL: Record<PeriodField, string> = { criado: 'Criados', fechado: 'Fechados' };

const PRESET_KEYS = PERIOD_PRESETS.map((p) => p.v) as readonly string[];
/** A busca antiga só tinha `criado=hoje|7d|30d|mes`; links salvos continuam valendo. */
const LEGACY_CREATED = ['hoje', '7d', '30d', 'mes'] as const;

// ─── Dias ────────────────────────────────────────────────────────────────────

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "AAAA-MM-DD" de verdade (nada de 31/02). */
export function isDay(s: string): boolean {
  const m = DAY.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100;
}

const fromUTC = (d: Date) => d.toISOString().slice(0, 10);
const toUTC = (day: string) => new Date(`${day}T12:00:00Z`);

export function addDays(day: string, n: number): string {
  const d = toUTC(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

export const monthStart = (day: string) => `${day.slice(0, 8)}01`;

/** Último dia do mês do dia dado. */
export function monthEnd(day: string): string {
  const d = toUTC(monthStart(day));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromUTC(d);
}

/** Hoje no horário da clínica. */
export function clinicDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

/** 00:00 e 23:59:59.999 de um dia em Brasília (UTC−3 o ano todo). */
export const dayStart = (day: string) => new Date(`${day}T00:00:00-03:00`);
export const dayEnd = (day: string) => new Date(`${day}T23:59:59.999-03:00`);

// ─── Período ─────────────────────────────────────────────────────────────────

export function presetRange(p: PeriodPreset, today: string): { from: string; to: string } {
  switch (p) {
    case 'hoje':
      return { from: today, to: today };
    case 'ontem': {
      const ontem = addDays(today, -1);
      return { from: ontem, to: ontem };
    }
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'mes':
      return { from: monthStart(today), to: today };
    case 'mes-passado': {
      const fim = addDays(monthStart(today), -1);
      return { from: monthStart(fim), to: fim };
    }
    case 'ano':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

export const hasPeriod = (p: Period) => Boolean(p.preset || p.from || p.to);

/** Os dias de verdade do período (atalho resolvido, ponta trocada se veio ao contrário). */
export function resolvePeriod(p: Period, today: string): { from: string; to: string } | null {
  if (p.preset) return presetRange(p.preset, today);
  if (!p.from && !p.to) return null;
  if (p.from && p.to && p.from > p.to) return { from: p.to, to: p.from };
  return { from: p.from, to: p.to };
}

/** O atalho que dá exatamente estes dias, para a tela marcar o botão certo. */
export function matchingPreset(from: string, to: string, today: string): PeriodPreset | '' {
  if (!from || !to) return '';
  return PERIOD_PRESETS.find((x) => {
    const r = presetRange(x.v, today);
    return r.from === from && r.to === to;
  })?.v ?? '';
}

/** Lê o período da URL sem confiar em nada que venha dela. */
export function parsePeriod(sp: Record<string, string | string[] | undefined>): Period {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const presetRaw = one('periodo');
  const legado = one('criado');
  const preset: Period['preset'] = PRESET_KEYS.includes(presetRaw)
    ? (presetRaw as PeriodPreset)
    : (LEGACY_CREATED as readonly string[]).includes(legado)
      ? (legado as PeriodPreset)
      : '';
  const from = preset ? '' : isDay(one('de')) ? one('de') : '';
  const to = preset ? '' : isDay(one('ate')) ? one('ate') : '';
  const field: PeriodField = one('data') === 'fechado' && (preset || from || to) ? 'fechado' : 'criado';
  return { field, preset, from, to };
}

/** O período como parâmetros da URL. Chave vazia = não vai para a URL. */
export function periodParams(p: Period): { periodo: string; de: string; ate: string; data: string } {
  const tem = hasPeriod(p);
  return {
    periodo: p.preset,
    de: p.preset ? '' : p.from,
    ate: p.preset ? '' : p.to,
    data: tem && p.field === 'fechado' ? 'fechado' : '',
  };
}

const PRESET_TEXT: Record<PeriodPreset, string> = {
  hoje: 'hoje',
  ontem: 'ontem',
  '7d': 'últimos 7 dias',
  '30d': 'últimos 30 dias',
  mes: 'este mês',
  'mes-passado': 'mês passado',
  ano: 'este ano',
};

/** "01/10/2026" */
export function dayBR(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** Os dias, curtos: "01/10 – 15/10/2026", "01/10/2026", "desde 01/10/2026". */
export function rangeText(from: string, to: string): string {
  if (from && to) {
    if (from === to) return dayBR(from);
    const mesmoAno = from.slice(0, 4) === to.slice(0, 4);
    return `${mesmoAno ? dayBR(from).slice(0, 5) : dayBR(from)} – ${dayBR(to)}`;
  }
  if (from) return `desde ${dayBR(from)}`;
  if (to) return `até ${dayBR(to)}`;
  return '';
}

/** O que o período diz, sem o campo: "últimos 7 dias", "01/10 – 15/10/2026". */
export function periodText(p: Period): string {
  if (p.preset) return PRESET_TEXT[p.preset];
  const [a, b] = p.from && p.to && p.from > p.to ? [p.to, p.from] : [p.from, p.to];
  return rangeText(a, b);
}

/** O texto do período para a busca e os botões: "Criados: últimos 7 dias". */
export function periodLabel(p: Period): string {
  return hasPeriod(p) ? `${FIELD_LABEL[p.field]}: ${periodText(p)}` : '';
}

/**
 * O filtro de banco de um período em dias fixos. Fechado = ganho ou perdido
 * naqueles dias (lead aberto nunca entra).
 */
export function rangeWhere(field: PeriodField, from: string, to: string): Prisma.LeadWhereInput | null {
  if (!from && !to) return null;
  const range = { ...(from ? { gte: dayStart(from) } : {}), ...(to ? { lte: dayEnd(to) } : {}) };
  return field === 'fechado' ? { OR: [{ wonAt: range }, { lostAt: range }] } : { createdAt: range };
}

export function periodWhere(p: Period, today: string): Prisma.LeadWhereInput | null {
  const r = resolvePeriod(p, today);
  return r ? rangeWhere(p.field, r.from, r.to) : null;
}
