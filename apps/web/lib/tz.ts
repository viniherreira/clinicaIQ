/**
 * The app stores appointment datetimes as "wall-clock in UTC": a time entered
 * as 14:00 is stored as 14:00Z, regardless of where the server runs. So we must
 * read the wall-clock back from the UTC components (not the viewer's local
 * timezone), and compute "today" in the clinic's timezone — otherwise a UTC
 * server shows the wrong day/time for Brazilian users.
 */
export const CLINIC_TZ = 'America/Sao_Paulo';

/** Today's calendar date (YYYY-MM-DD) in the clinic timezone. */
export function clinicToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(new Date());
}

/** Wall-clock HH:mm of a stored datetime (read from UTC components). */
export function wallClockTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

/** Wall-clock minutes-since-midnight, for positioning blocks on the grid. */
export function wallClockMinutes(d: Date | string): number {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
