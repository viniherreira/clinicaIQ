/**
 * Working-hours helpers shared by the agenda grid (visual "expediente") and the
 * appointment validation. Times are plain "HH:mm" wall-clock strings; the grid
 * converts them to pixels the same way appointment blocks do.
 */

export interface DaySchedule {
  /** Start of the working day, "HH:mm". */
  start: string;
  /** End of the working day, "HH:mm". */
  end: string;
  /** Optional lunch break — both must be set to render/apply. */
  lunchStart?: string | null;
  lunchEnd?: string | null;
}

/** Index 0..6 = Sunday..Saturday (matches Date.getUTCDay). `null` = closed. */
export type WeekSchedule = (DaySchedule | null)[];

/** Minutes since midnight for a "HH:mm" string (returns null when malformed). */
export function timeToMin(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Intervals *outside* the working day (before start, lunch, after end),
 * clamped to the visible grid window. Used to dim the agenda. Each item is
 * `[fromMin, toMin]` in minutes since midnight.
 */
export function nonWorkingIntervals(
  day: DaySchedule | null,
  gridStartMin: number,
  gridEndMin: number,
): [number, number][] {
  // Closed the whole day → dim everything.
  if (!day) return [[gridStartMin, gridEndMin]];

  const start = timeToMin(day.start);
  const end = timeToMin(day.end);
  if (start === null || end === null || end <= start) return [];

  const out: [number, number][] = [];
  const clampedStart = Math.max(gridStartMin, start);
  const clampedEnd = Math.min(gridEndMin, end);

  if (clampedStart > gridStartMin) out.push([gridStartMin, clampedStart]);
  if (clampedEnd < gridEndMin) out.push([clampedEnd, gridEndMin]);

  const ls = timeToMin(day.lunchStart);
  const le = timeToMin(day.lunchEnd);
  if (ls !== null && le !== null && le > ls) {
    out.push([Math.max(gridStartMin, ls), Math.min(gridEndMin, le)]);
  }
  return out.filter(([a, b]) => b > a);
}

/**
 * Whether a [startMin, endMin) appointment falls fully inside the working day
 * (and outside lunch). Used to warn when scheduling off-hours. A `null` day is
 * always off-hours.
 */
export function isWithinWorkingHours(
  day: DaySchedule | null,
  startMin: number,
  endMin: number,
): boolean {
  if (!day) return false;
  const start = timeToMin(day.start);
  const end = timeToMin(day.end);
  if (start === null || end === null) return false;
  if (startMin < start || endMin > end) return false;

  const ls = timeToMin(day.lunchStart);
  const le = timeToMin(day.lunchEnd);
  if (ls !== null && le !== null && le > ls) {
    // Overlaps the lunch break?
    if (startMin < le && endMin > ls) return false;
  }
  return true;
}
