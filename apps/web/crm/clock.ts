import { CLINIC_TZ } from '@/lib/tz';

/**
 * Dois relógios convivem no CRM:
 *
 * - Agendamentos são "hora de parede em UTC" (ver `lib/tz.ts`): 14h digitado
 *   na agenda é gravado como 14:00Z. Para saber se um agendamento ainda está
 *   no futuro, compara-se com a hora de parede de agora, no mesmo formato.
 * - Tarefas do CRM são instantes de verdade: "amanhã às 10h" em São Paulo é
 *   13:00Z. Assim "atrasada" é só `dueAt < agora`, sem conversão.
 */

function partsIn(timeZone: string, d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Agora, como hora de parede da clínica gravada em UTC — o formato da agenda. */
export function clinicNowWall(now: Date = new Date()): Date {
  const p = partsIn(CLINIC_TZ, now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

/**
 * O instante de "daqui a N dias, às H horas" no horário da clínica.
 * Usado nas tarefas automáticas ("Reagendar avaliação", amanhã às 10h).
 */
export function clinicDateAt(daysAhead: number, hour: number, now: Date = new Date()): Date {
  const hoje = partsIn(CLINIC_TZ, now);
  // Date.UTC normaliza o dia 32 para o dia 1 do mês seguinte.
  const dia = new Date(Date.UTC(hoje.year, hoje.month - 1, hoje.day + daysAhead));
  return clinicWallToInstant(dia.getUTCFullYear(), dia.getUTCMonth() + 1, dia.getUTCDate(), hour, 0);
}

/**
 * O instante em que o relógio da clínica marca esta data e hora. Palpite em
 * UTC corrigido pelo deslocamento real do fuso naquele instante: funciona com
 * ou sem horário de verão.
 */
function clinicWallToInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  const palpite = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const visto = partsIn(CLINIC_TZ, palpite);
  const vistoUtc = Date.UTC(visto.year, visto.month - 1, visto.day, visto.hour, visto.minute, visto.second);
  return new Date(palpite.getTime() + (palpite.getTime() - vistoUtc));
}

/**
 * Valor de um `<input type="datetime-local">` ("2026-10-10T10:00"), lido como
 * horário da clínica → instante. Null se o texto não for uma data.
 */
export function clinicLocalToInstant(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const r = clinicWallToInstant(y, mo, d, h, mi);
  return Number.isNaN(r.getTime()) ? null : r;
}

/** O inverso, para preencher o campo: instante → "2026-10-10T10:00" na clínica. */
export function instantToClinicLocal(d: Date): string {
  const p = partsIn(CLINIC_TZ, d);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}
