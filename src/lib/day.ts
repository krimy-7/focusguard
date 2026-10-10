// Pure date helpers. No runtime imports: tested directly by `node --test` (type stripping).

/** IANA zone of this device, e.g. "Asia/Kathmandu". */
export function deviceTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** YYYY-MM-DD of `now` as seen in IANA zone `tz`. */
export function localDay(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The last `n` local days ending today, newest first. Date arithmetic in UTC so DST never skips a day. */
export function recentDays(n: number, now: Date, tz: string): string[] {
  const today = Date.parse(`${localDay(now, tz)}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(today - i * 86_400_000).toISOString().slice(0, 10));
}

/** "Saturday, Oct 10" for a YYYY-MM-DD day (rendered at UTC noon so no zone can shift it). */
export function dayLabel(day: string, locale?: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Sat" for a YYYY-MM-DD day (UTC noon, so no zone can shift it). */
export function dayShort(day: string, locale?: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
}

export function isHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Client-side check before PATCH /me settings.quiet_hours. Overnight ranges (22:00→07:00) are valid. */
export function quietHoursError(ranges: { from: string; to: string }[]): string | null {
  if (ranges.length > 3) return 'You can have up to 3 quiet periods.';
  for (let i = 0; i < ranges.length; i++) {
    const { from, to } = ranges[i];
    if (!isHHMM(from) || !isHHMM(to)) return `Use 24-hour time like 22:00 (period ${i + 1}).`;
    if (from === to) return `Period ${i + 1} starts and ends at the same time.`;
  }
  return null;
}
