import { CLINIC_TZ } from '@/lib/tz';

/**
 * Gatilho e condições das automações por etapa (o "funil digital" do Kommo).
 * Puro: quem agenda (`stage-queue.ts`) e quem mostra (a grade do funil) usam
 * as mesmas regras.
 */

export type StageTriggerKind = 'ENTER' | 'CREATED' | 'MOVED';

export const TRIGGER_LABEL: Record<StageTriggerKind, string> = {
  ENTER: 'Quando entra nesta etapa',
  CREATED: 'Quando criado nesta etapa',
  MOVED: 'Quando movido para esta etapa',
};

export const LEAD_SOURCES = ['WHATSAPP', 'INSTAGRAM', 'SITE', 'INDICACAO', 'MANUAL', 'OUTRO'] as const;
export type LeadSourceKey = (typeof LEAD_SOURCES)[number];

export interface StageConditions {
  /** Dias da semana em que vale (0 = domingo). Vazio: todos. */
  days?: number[];
  /** Faixa de horário da clínica, "HH:MM". Se "de" passa de "até", vira a noite (18:00 às 08:00). */
  from?: string;
  to?: string;
  /** Só leads destas origens. */
  sources?: LeadSourceKey[];
  /** Só leads com alguma destas tags. */
  tagIds?: string[];
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** O que veio da tela (ou do banco), limpo. Horário só vale com "de" e "até". */
export function parseConditions(raw: unknown): StageConditions {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: StageConditions = {};
  if (Array.isArray(c.days)) {
    const days = [...new Set(c.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (days.length > 0 && days.length < 7) out.days = days;
  }
  if (typeof c.from === 'string' && typeof c.to === 'string' && HORA.test(c.from) && HORA.test(c.to) && c.from !== c.to) {
    out.from = c.from;
    out.to = c.to;
  }
  if (Array.isArray(c.sources)) {
    const sources = LEAD_SOURCES.filter((s) => (c.sources as unknown[]).includes(s));
    if (sources.length > 0) out.sources = sources;
  }
  if (Array.isArray(c.tagIds)) {
    const tagIds = [...new Set(c.tagIds.filter((t): t is string => typeof t === 'string' && t.length > 0))].slice(0, 20);
    if (tagIds.length > 0) out.tagIds = tagIds;
  }
  return out;
}

export function hasConditions(c: StageConditions): boolean {
  return Boolean(c.days || c.from || c.sources || c.tagIds);
}

/** O gatilho vale para este jeito de entrar na etapa? */
export function triggerMatches(trigger: StageTriggerKind, kind: 'created' | 'moved'): boolean {
  return trigger === 'ENTER' || (trigger === 'CREATED' ? kind === 'created' : kind === 'moved');
}

/** Dia da semana e minuto do dia na clínica. */
export function clinicWeekMinute(at: Date): { day: number; minute: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day, minute: Number(p.hour) * 60 + Number(p.minute) };
}

/** As condições batem com este lead, agora? */
export function matchesConditions(
  c: StageConditions,
  lead: { source: string; tagIds: readonly string[] },
  at: Date,
): boolean {
  if (c.sources && !c.sources.includes(lead.source as LeadSourceKey)) return false;
  if (c.tagIds && !c.tagIds.some((t) => lead.tagIds.includes(t))) return false;
  if (c.days || c.from) {
    const { day, minute } = clinicWeekMinute(at);
    if (c.days && !c.days.includes(day)) return false;
    if (c.from && c.to) {
      const de = minutos(c.from);
      const ate = minutos(c.to);
      const dentro = de < ate ? minute >= de && minute < ate : minute >= de || minute < ate;
      if (!dentro) return false;
    }
  }
  return true;
}

const DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Seg - Sex", "Sáb - Dom", "Seg, Qua, Sex". */
export function daysLabel(days: readonly number[]): string {
  // Semana começando na segunda, como no Kommo: Sáb - Dom fica junto.
  const ordem = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  const pos = (d: number) => (d + 6) % 7;
  const seguidos = ordem.length > 2 && ordem.every((d, i) => i === 0 || pos(d) === pos(ordem[i - 1]) + 1);
  if (seguidos || (ordem.length === 2 && pos(ordem[1]) === pos(ordem[0]) + 1)) return `${DIA[ordem[0]]} - ${DIA[ordem[ordem.length - 1]]}`;
  return ordem.map((d) => DIA[d]).join(', ');
}

/** Os rótulos das condições, para os chips do cartão. */
export function conditionChips(c: StageConditions, names: { tags: ReadonlyMap<string, string>; sources: Record<string, string> }): string[] {
  const chips: string[] = [];
  if (c.days || c.from) {
    const dias = c.days ? daysLabel(c.days) : 'Todos os dias';
    chips.push(c.from ? `${dias} de ${c.from} às ${c.to}` : dias);
  }
  if (c.sources) chips.push(`Origem: ${c.sources.map((s) => names.sources[s] ?? s).join(', ')}`);
  if (c.tagIds) chips.push(`Com a tag: ${c.tagIds.map((t) => names.tags.get(t) ?? '(apagada)').join(', ')}`);
  return chips;
}
