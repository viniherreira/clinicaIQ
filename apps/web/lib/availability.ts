import { timeToMin, type DaySchedule } from './schedule';
import { CLINIC_TZ } from './tz';

/**
 * Horários livres de um profissional num dia — o que o agendamento online
 * oferece ao paciente. Puro: recebe o expediente e o que já está ocupado (em
 * minutos desde a meia-noite, hora de parede) e devolve os inícios "HH:mm".
 */
export function freeSlots({
  day,
  busy,
  durationMin,
  stepMin,
  notBeforeMin = 0,
}: {
  day: DaySchedule | null;
  /** Intervalos [início, fim) já tomados: agendamentos e bloqueios. */
  busy: [number, number][];
  durationMin: number;
  stepMin: number;
  /** Nada antes disso (hoje: agora + antecedência mínima). */
  notBeforeMin?: number;
}): string[] {
  if (!day || durationMin <= 0 || stepMin <= 0) return [];
  const ini = timeToMin(day.start);
  const fim = timeToMin(day.end);
  if (ini === null || fim === null || fim <= ini) return [];

  const ocupado: [number, number][] = [...busy];
  const ls = timeToMin(day.lunchStart);
  const le = timeToMin(day.lunchEnd);
  if (ls !== null && le !== null && le > ls) ocupado.push([ls, le]);

  const out: string[] = [];
  for (let s = ini; s + durationMin <= fim; s += stepMin) {
    if (s < notBeforeMin) continue;
    const e = s + durationMin;
    if (ocupado.some(([a, b]) => s < b && e > a)) continue;
    out.push(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
  }
  return out;
}

/** Agora no relógio da clínica: o dia "AAAA-MM-DD" e os minutos desde a meia-noite. */
export function clinicNow(now: Date = new Date()): { date: string; minutes: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '00';
  return { date: `${v('year')}-${v('month')}-${v('day')}`, minutes: Number(v('hour')) * 60 + Number(v('minute')) };
}

/** As regras do agendamento online da clínica, guardadas em `Tenant.settings.onlineBooking`. */
export interface OnlineBookingSettings {
  enabled: boolean;
  /** Profissionais que aparecem; vazio = todos os ativos. */
  professionalIds: string[];
  /** Procedimentos que o paciente pode escolher; vazio = nenhum (só "consulta"). */
  procedureIds: string[];
  /** Antecedência mínima, em horas. */
  minAdvanceHours: number;
  /** Até quantos dias à frente. */
  maxDaysAhead: number;
  /** De quantos em quantos minutos começam os horários oferecidos. */
  stepMinutes: number;
  /** Duração quando o paciente não escolhe procedimento. */
  defaultDurationMinutes: number;
}

export const ONLINE_BOOKING_DEFAULTS: OnlineBookingSettings = {
  enabled: false,
  professionalIds: [],
  procedureIds: [],
  minAdvanceHours: 2,
  maxDaysAhead: 30,
  stepMinutes: 30,
  defaultDurationMinutes: 30,
};

/**
 * Travas do agendamento online, que é público: por dia, no máximo tantos
 * agendamentos por clínica e tantos pedidos por WhatsApp. Cada pedido cria
 * paciente e consulta e manda mensagem pelo número da clínica — sem teto, um
 * script lotava a agenda e fazia a clínica escrever para estranhos.
 */
export const ONLINE_BOOKING_DAILY_CAP = 30;
export const ONLINE_BOOKING_PER_PHONE_DAILY = 3;

const entre = (v: unknown, min: number, max: number, padrao: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : padrao;
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : []);

/** Lê as regras do JSON de configurações, aceitando o que vier e caindo no padrão. */
export function readOnlineBooking(settings: unknown): OnlineBookingSettings {
  const raw = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).onlineBooking : undefined;
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = ONLINE_BOOKING_DEFAULTS;
  return {
    enabled: o.enabled === true,
    professionalIds: ids(o.professionalIds),
    procedureIds: ids(o.procedureIds),
    minAdvanceHours: entre(o.minAdvanceHours, 0, 72, d.minAdvanceHours),
    maxDaysAhead: entre(o.maxDaysAhead, 1, 120, d.maxDaysAhead),
    stepMinutes: [10, 15, 20, 30, 60].includes(o.stepMinutes as number) ? (o.stepMinutes as number) : d.stepMinutes,
    defaultDurationMinutes: entre(o.defaultDurationMinutes, 10, 240, d.defaultDurationMinutes),
  };
}
