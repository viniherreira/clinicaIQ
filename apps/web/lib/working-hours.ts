import 'server-only';

import { prisma } from '@clinicaiq/db';
import type { WeekSchedule } from './schedule';
import { inUnit } from './unit-rules';

// ─── Working hours ─────────────────────────────────────────────────────────────

interface DayHoursLike { open: boolean; start: string; end: string }

function isDayHoursLike(v: unknown): v is DayHoursLike {
  return (
    !!v && typeof v === 'object' &&
    typeof (v as DayHoursLike).open === 'boolean' &&
    typeof (v as DayHoursLike).start === 'string' &&
    typeof (v as DayHoursLike).end === 'string'
  );
}

/** Reads business hours (clinic settings JSON or a unit's own) as a 7-day fallback. */
function readBusinessWeek(bh: unknown): WeekSchedule {
  return Array.from({ length: 7 }, (_, i) => {
    const day = Array.isArray(bh) ? bh[i] : undefined;
    if (isDayHoursLike(day) && day.open) return { start: day.start, end: day.end };
    return null;
  });
}

/** A unidade da agenda: só valem os dias em que o profissional atende nela. */
export interface UnitScope {
  unitId: string;
  mainId: string;
  /** Horário próprio da unidade; nulo = o da clínica. */
  businessHours: unknown;
}

/**
 * Effective weekly working hours per professional. A professional with saved
 * `ProfessionalSchedule` rows uses them (days without a row = closed); otherwise
 * it falls back to the business hours (the unit's own, or the clinic's). With a
 * `unit`, a day booked at another unit counts as closed here. Index 0..6 = Sunday..Saturday.
 */
export async function buildWorkingHoursMap(
  tenantId: string,
  professionalIds: string[],
  unit?: UnitScope,
): Promise<Record<string, WeekSchedule>> {
  if (professionalIds.length === 0) return {};

  const [schedules, tenant] = await Promise.all([
    prisma.professionalSchedule.findMany({
      where: { professionalId: { in: professionalIds }, professional: { tenantId } },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
  ]);

  const clinicBh = ((tenant?.settings ?? {}) as Record<string, unknown>).businessHours;
  const businessWeek = readBusinessWeek(unit?.businessHours ?? clinicBh);

  const byProf = new Map<string, WeekSchedule>();
  for (const s of schedules) {
    let week = byProf.get(s.professionalId);
    if (!week) {
      week = Array.from({ length: 7 }, () => null);
      byProf.set(s.professionalId, week);
    }
    if (unit && !inUnit(s.unitId, unit.unitId, unit.mainId)) continue;
    week[s.dayOfWeek] = {
      start: s.startTime,
      end: s.endTime,
      lunchStart: s.lunchStart,
      lunchEnd: s.lunchEnd,
    };
  }

  const map: Record<string, WeekSchedule> = {};
  for (const pid of professionalIds) {
    map[pid] = byProf.get(pid) ?? businessWeek;
  }
  return map;
}

