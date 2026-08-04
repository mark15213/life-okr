import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getDateString, getDayRange, recentDays } from './day';

const SH = 'Asia/Shanghai';
const NY = 'America/New_York';

const utc = (iso: string) => Date.parse(iso);

test('a Shanghai day runs from 16:00Z the previous day to 16:00Z', () => {
  // Asia/Shanghai is UTC+8 year round, so local midnight is 16:00Z the day before.
  const { startMs, endMs } = getDayRange('2026-08-04', SH);

  assert.equal(startMs, utc('2026-08-03T16:00:00.000Z'));
  assert.equal(endMs, utc('2026-08-04T16:00:00.000Z'));
});

test('day boundaries do not depend on the process timezone', () => {
  // The whole point: Vercel runs in UTC and the laptop in Asia/Shanghai, and both must
  // derive the same window for the same date string.
  const asShanghai = getDayRange('2026-08-04', SH);
  const asUtc = getDayRange('2026-08-04', 'UTC');

  assert.equal(asShanghai.startMs, utc('2026-08-03T16:00:00.000Z'));
  assert.equal(asUtc.startMs, utc('2026-08-04T00:00:00.000Z'));
  assert.notEqual(asShanghai.startMs, asUtc.startMs);
});

test('an ordinary day is exactly 24 hours', () => {
  const { startMs, endMs } = getDayRange('2026-08-04', SH);
  assert.equal(endMs - startMs, 24 * 60 * 60 * 1000);
});

test('the day a DST zone springs forward is 23 hours, not 24', () => {
  // 2026-03-08, New York: 02:00 EST jumps to 03:00 EDT.
  const { startMs, endMs } = getDayRange('2026-03-08', NY);

  assert.equal(startMs, utc('2026-03-08T05:00:00.000Z')); // midnight EST (UTC-5)
  assert.equal(endMs, utc('2026-03-09T04:00:00.000Z')); // midnight EDT (UTC-4)
  assert.equal(endMs - startMs, 23 * 60 * 60 * 1000);
});

test('the day a DST zone falls back is 25 hours', () => {
  // 2026-11-01, New York: 02:00 EDT falls back to 01:00 EST.
  const { startMs, endMs } = getDayRange('2026-11-01', NY);

  assert.equal(startMs, utc('2026-11-01T04:00:00.000Z')); // midnight EDT (UTC-4)
  assert.equal(endMs, utc('2026-11-02T05:00:00.000Z')); // midnight EST (UTC-5)
  assert.equal(endMs - startMs, 25 * 60 * 60 * 1000);
});

test('consecutive days are contiguous, with no gap or overlap across a DST change', () => {
  const first = getDayRange('2026-03-08', NY);
  const second = getDayRange('2026-03-09', NY);
  assert.equal(first.endMs, second.startMs);
});

test('getDateString names the day the instant falls in, in the given zone', () => {
  // 15:59Z is still Aug 3 in Shanghai; one minute later it is Aug 4.
  assert.equal(getDateString(new Date('2026-08-03T15:59:59.999Z'), SH), '2026-08-03');
  assert.equal(getDateString(new Date('2026-08-03T16:00:00.000Z'), SH), '2026-08-04');
});

test('getDateString disagrees with UTC exactly when the zone offset pushes it over midnight', () => {
  // This disagreement is the bug that silently zeroed two weeks of history: a UTC-derived
  // date string stamped onto a window queried in local time.
  const instant = new Date('2026-08-03T18:00:00.000Z');
  assert.equal(getDateString(instant, SH), '2026-08-04');
  assert.equal(getDateString(instant, 'UTC'), '2026-08-03');
});

test('a date string round-trips through its own range', () => {
  for (const date of ['2026-08-04', '2026-01-01', '2026-12-31', '2026-02-28']) {
    const { startMs, endMs } = getDayRange(date, SH);
    assert.equal(getDateString(new Date(startMs), SH), date, `start of ${date}`);
    assert.equal(getDateString(new Date(endMs - 1), SH), date, `end of ${date}`);
  }
});

test('recentDays returns the trailing window oldest first, today last', () => {
  const now = new Date('2026-08-04T02:00:00.000Z'); // 10:00 in Shanghai
  assert.deepEqual(
    recentDays(3, now, SH).map((d) => d.date),
    ['2026-08-02', '2026-08-03', '2026-08-04']
  );
});

test('recentDays reads the early hours as the local day, not the UTC one', () => {
  // 2026-08-03T17:00Z is 01:00 on Aug 4 in Shanghai. A UTC reading would call this Aug 3
  // and write today's numbers onto yesterday's row.
  const now = new Date('2026-08-03T17:00:00.000Z');
  const days = recentDays(2, now, SH);

  assert.equal(days[days.length - 1].date, '2026-08-04');
});

test('recentDays entries carry their own range, and today contains now', () => {
  const now = new Date('2026-08-04T02:00:00.000Z');
  const days = recentDays(3, now, SH);

  for (const day of days) {
    assert.deepEqual(day.range, getDayRange(day.date, SH), day.date);
  }
  const today = days[days.length - 1];
  assert.ok(today.range.startMs <= now.getTime() && now.getTime() < today.range.endMs);
});

test('recentDays walks the calendar across month and year ends', () => {
  assert.deepEqual(
    recentDays(3, new Date('2027-01-01T02:00:00.000Z'), SH).map((d) => d.date),
    ['2026-12-30', '2026-12-31', '2027-01-01']
  );
  // Non-leap year: March 1 steps back to Feb 28, not a phantom Feb 29.
  assert.deepEqual(
    recentDays(2, new Date('2026-03-01T02:00:00.000Z'), SH).map((d) => d.date),
    ['2026-02-28', '2026-03-01']
  );
});

test('recentDays entries are contiguous', () => {
  const days = recentDays(5, new Date('2026-08-04T02:00:00.000Z'), SH);
  assert.equal(days.length, 5);
  for (let i = 1; i < days.length; i++) {
    assert.equal(days[i].range.startMs, days[i - 1].range.endMs, `gap before ${days[i].date}`);
  }
});

test('recentDays rejects a non-positive window instead of silently syncing nothing', () => {
  assert.throws(() => recentDays(0, new Date(), SH), /at least 1/);
  assert.throws(() => recentDays(-2, new Date(), SH), /at least 1/);
});
