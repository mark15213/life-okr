export interface LocalDayRange {
  startMs: number;
  endMs: number;
}

export function getLocalDayRange(now: Date): LocalDayRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

export function getLocalDateString(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface LocalDay {
  /** YYYY-MM-DD in the process TZ — the exact string used to stamp the daily_records row. */
  date: string;
  range: LocalDayRange;
}

/**
 * The last `count` local days, oldest first, ending with the day `now` falls in.
 *
 * The sync used to write only today. That is only correct if the machine happens to be
 * awake near the end of every day: on 2026-07-31 the laptop slept from 02:10 and the last
 * run of the day had already stored focus=0, so the four sessions logged from 10:00 onward
 * were never picked up — and once the date rolled over, nothing ever looked at that day
 * again. Re-syncing a trailing window makes any later successful run repair the gap.
 *
 * Days are stepped with `new Date(y, m, d - i)`, not by subtracting 24h of milliseconds,
 * so month/year ends and DST-shifted days (23h or 25h long) still land on real calendar
 * dates rather than drifting into the neighbouring day.
 */
export function recentLocalDays(count: number, now: Date): LocalDay[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`recentLocalDays: window must be at least 1 day, got ${count}`);
  }

  const days: LocalDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12, 0, 0, 0);
    days.push({ date: getLocalDateString(day), range: getLocalDayRange(day) });
  }
  return days;
}
