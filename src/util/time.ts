/** Timezone-aware date helpers built on Intl (no deps). */

/** Format an instant as YYYY-MM-DD in the given IANA timezone. */
export function localDate(instant: Date, timezone: string): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Today's local date (YYYY-MM-DD) in a timezone. */
export function todayLocal(timezone: string, now: Date = new Date()): string {
  return localDate(now, timezone);
}

/** Add `days` to a YYYY-MM-DD string (calendar arithmetic, no tz drift). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Whole days from local `today` to a YYYY-MM-DD date (negative = past). */
export function daysAhead(dateStr: string, timezone: string, now: Date = new Date()): number {
  const today = todayLocal(timezone, now);
  const a = Date.UTC(...(today.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(dateStr.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / 86_400_000);
}
