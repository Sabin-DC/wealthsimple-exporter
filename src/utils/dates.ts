function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a Date as YYYY-MM-DD in the user's local time zone (toISOString would use UTC). */
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp; falls back to its date part if unparseable. */
export function isoToLocalDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso.split('T')[0] : toLocalDateString(parsed);
}

/** Add days to a YYYY-MM-DD string using local calendar arithmetic (no UTC shifting). */
export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + days));
}
