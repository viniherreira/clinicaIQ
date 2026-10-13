/**
 * Regras da agenda que a clínica escolhe (Configurações → Agenda → Regras da
 * agenda), guardadas em `Tenant.settings.agenda`. Puro: lê o JSON aceitando o
 * que vier e caindo no padrão — testado em `agenda-rules.test.ts`.
 */

export const SLOT_OPTIONS = [5, 10, 15, 20, 30] as const;

export interface AgendaRules {
  /** De quantos em quantos minutos a grade marca (e o clique escolhe). */
  slotMinutes: number;
  /** Primeira e última hora que a grade mostra. */
  startHour: number;
  endHour: number;
  /** Duração do agendamento quando não há procedimento. */
  defaultDurationMinutes: number;
  /** Encaixe: aceita dois horários do mesmo profissional ao mesmo tempo. */
  allowOverlap: boolean;
}

export const AGENDA_DEFAULTS: AgendaRules = {
  slotMinutes: 10,
  startHour: 7,
  endHour: 21,
  defaultDurationMinutes: 30,
  allowOverlap: false,
};

const inteiro = (v: unknown, min: number, max: number, padrao: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : padrao;

export function readAgendaRules(settings: unknown): AgendaRules {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).agenda : undefined;
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = AGENDA_DEFAULTS;
  const startHour = inteiro(o.startHour, 0, 12, d.startHour);
  let endHour = inteiro(o.endHour, 13, 24, d.endHour);
  if (endHour <= startHour) endHour = d.endHour;
  return {
    slotMinutes: (SLOT_OPTIONS as readonly number[]).includes(o.slotMinutes as number) ? (o.slotMinutes as number) : d.slotMinutes,
    startHour,
    endHour,
    defaultDurationMinutes: inteiro(o.defaultDurationMinutes, 5, 240, d.defaultDurationMinutes),
    allowOverlap: o.allowOverlap === true,
  };
}

/** A geometria da grade: a hora tem sempre a mesma altura; o intervalo só muda as linhas e o clique. */
export const HOUR_PX = 96;

export interface AgendaGrid {
  startHour: number;
  endHour: number;
  slotMinutes: number;
  slotHeight: number;
  hourPx: number;
  totalHeight: number;
  /** Minutos desde a meia-noite → posição na grade. */
  minToPx: (minutes: number) => number;
}

export function makeGrid(r: Pick<AgendaRules, 'startHour' | 'endHour' | 'slotMinutes'>): AgendaGrid {
  const pxPorMin = HOUR_PX / 60;
  return {
    startHour: r.startHour,
    endHour: r.endHour,
    slotMinutes: r.slotMinutes,
    slotHeight: r.slotMinutes * pxPorMin,
    hourPx: HOUR_PX,
    totalHeight: (r.endHour - r.startHour) * HOUR_PX,
    minToPx: (m) => (m - r.startHour * 60) * pxPorMin,
  };
}
