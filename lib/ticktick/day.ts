/**
 * Local-day arithmetic for an explicitly named timezone.
 *
 * The sibling helpers in `scripts/lib/ticktick-date.ts` read the *process* timezone, which is
 * right on the laptop and wrong everywhere else: Vercel runs in UTC, so `new Date().getHours()`
 * there answers a different question than it does on the Mac. Two writers disagreeing about
 * where a day starts do not merely round differently — they stamp different rows from different
 * windows and then overwrite each other, which is how a fortnight of history was once zeroed.
 *
 * Everything here takes the zone as an argument and derives boundaries through `Intl`, so the
 * answer is the same on any machine.
 */

export interface DayRange {
  startMs: number;
  endMs: number;
}

export interface LocalDay {
  /** YYYY-MM-DD in the given zone — the exact string that stamps the daily_records row. */
  date: string;
  range: DayRange;
}

/** The calendar date an instant falls on, in `timeZone`. `en-CA` formats as YYYY-MM-DD. */
export function getDateString(instant: Date, timeZone: string): string {
  return instant.toLocaleDateString('en-CA', { timeZone });
}

const PARTS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let dtf = PARTS.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    PARTS.set(timeZone, dtf);
  }
  return dtf;
}

/**
 * How far ahead of UTC `timeZone` is at `utcMs`, in milliseconds.
 *
 * Read by formatting the instant into the zone and reinterpreting those wall-clock fields as
 * if they were UTC: the difference between that and the original instant is the offset.
 */
function offsetMsAt(utcMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const field = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  // `hour12: false` renders midnight as hour 24 in some ICU versions; normalize it to 0.
  const hour = field('hour') % 24;
  const asUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    hour,
    field('minute'),
    field('second')
  );
  return asUtc - utcMs;
}

/** The instant local midnight of `date` occurs at, in epoch ms. */
function startOfDayMs(date: string, timeZone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, 0, 0, 0);

  // Two passes: the first guesses the offset using the wall-clock instant, the second reads
  // it again at the corrected instant. That second read is what gets DST-shifted days right,
  // where midnight sits on a different offset than the naive guess assumed.
  const firstGuess = wallClock - offsetMsAt(wallClock, timeZone);
  return wallClock - offsetMsAt(firstGuess, timeZone);
}

/**
 * The half-open [start, end) span of one local day, in epoch ms.
 *
 * Derived from the *next* date's midnight rather than by adding 24h, so days that a DST
 * transition makes 23 or 25 hours long stay contiguous with their neighbours.
 */
export function getDayRange(date: string, timeZone: string): DayRange {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);

  return { startMs: startOfDayMs(date, timeZone), endMs: startOfDayMs(next, timeZone) };
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The last `count` local days, oldest first, ending with the day `now` falls in.
 *
 * A trailing window rather than today alone: a machine that was asleep at the end of a day
 * would otherwise leave that day frozen at whatever partial figure was last stored, and
 * nothing would ever look at it again once the date rolled over.
 */
export function recentDays(count: number, now: Date, timeZone: string): LocalDay[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`recentDays: window must be at least 1 day, got ${count}`);
  }

  const today = getDateString(now, timeZone);
  const days: LocalDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = shiftDate(today, -i);
    days.push({ date, range: getDayRange(date, timeZone) });
  }
  return days;
}
