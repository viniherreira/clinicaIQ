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
  // Palpite em UTC e correção pelo deslocamento real do fuso naquele instante:
  // funciona com ou sem horário de verão.
  const palpite = new Date(Date.UTC(hoje.year, hoje.month - 1, hoje.day + daysAhead, hour, 0, 0));
  const visto = partsIn(CLINIC_TZ, palpite);
  const vistoUtc = Date.UTC(visto.year, visto.month - 1, visto.day, visto.hour, visto.minute, visto.second);
  return new Date(palpite.getTime() + (palpite.getTime() - vistoUtc));
}
