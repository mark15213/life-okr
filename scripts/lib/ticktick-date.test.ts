import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getLocalDayRange, getLocalDateString, recentLocalDays } from './ticktick-date';

test('getLocalDayRange returns midnight-to-midnight ms in process TZ', () => {
  const now = new Date('2026-05-24T15:30:00Z');
  const { startMs, endMs } = getLocalDayRange(now);

  // start should be at hour 0 in local TZ
  assert.equal(new Date(startMs).getHours(), 0);
  assert.equal(new Date(startMs).getMinutes(), 0);
  assert.equal(new Date(startMs).getSeconds(), 0);
  assert.equal(new Date(startMs).getMilliseconds(), 0);

  // end should be exactly 24h later
  assert.equal(endMs - startMs, 24 * 60 * 60 * 1000);

  // `now` should fall inside [start, end)
  assert.ok(startMs <= now.getTime() && now.getTime() < endMs);
});

test('getLocalDayRange: same day across multiple times-of-day produces same range', () => {
  const morning = new Date(2026, 4, 24, 7, 0, 0);   // May 24 07:00 local
  const evening = new Date(2026, 4, 24, 22, 0, 0);  // May 24 22:00 local
  const a = getLocalDayRange(morning);
  const b = getLocalDayRange(evening);
  assert.equal(a.startMs, b.startMs);
  assert.equal(a.endMs, b.endMs);
});

test('getLocalDateString uses local-TZ calendar date, not UTC', () => {
  // Constructed via local-component Date so the assertion is TZ-independent.
  const localMidMorning = new Date(2026, 5, 6, 9, 0, 0);  // Jun 6 09:00 local
  assert.equal(getLocalDateString(localMidMorning), '2026-06-06');

  // 02:00 local on Jun 6 is still Jun 6 locally. In China this is 18:00 UTC of Jun 5;
  // toISOString().slice(0,10) would give "2026-06-05" — which is the bug we're guarding
  // against. The helper must return the local date string regardless of TZ offset.
  const localEarlyMorning = new Date(2026, 5, 6, 2, 0, 0); // Jun 6 02:00 local
  assert.equal(getLocalDateString(localEarlyMorning), '2026-06-06');
});

test('recentLocalDays returns the trailing window oldest-first, today last', () => {
  const now = new Date(2026, 7, 1, 20, 0, 0); // Aug 1 2026 20:00 local
  const days = recentLocalDays(3, now);

  assert.deepEqual(days.map((d) => d.date), ['2026-07-30', '2026-07-31', '2026-08-01']);
});

test('recentLocalDays: each entry carries that day own midnight-to-midnight range', () => {
  const now = new Date(2026, 7, 1, 20, 0, 0);
  const days = recentLocalDays(3, now);

  for (const d of days) {
    // Range must be the local day named by `date`, not an offset from `now`.
    const [y, m, dd] = d.date.split('-').map(Number);
    const expected = getLocalDayRange(new Date(y, m - 1, dd, 12, 0, 0));
    assert.equal(d.range.startMs, expected.startMs, `start for ${d.date}`);
    assert.equal(d.range.endMs, expected.endMs, `end for ${d.date}`);
    assert.equal(getLocalDateString(new Date(d.range.startMs)), d.date);
  }
});

test('recentLocalDays: today is the last entry and contains `now`', () => {
  const now = new Date(2026, 7, 1, 20, 0, 0);
  const days = recentLocalDays(3, now);
  const today = days[days.length - 1];

  assert.equal(today.date, getLocalDateString(now));
  assert.ok(today.range.startMs <= now.getTime() && now.getTime() < today.range.endMs);
});

test('recentLocalDays: count of 1 degrades to today only (old behaviour)', () => {
  const now = new Date(2026, 7, 1, 2, 0, 0); // 02:00 local, the hour that froze 2026-07-31
  const days = recentLocalDays(1, now);

  assert.equal(days.length, 1);
  assert.equal(days[0].date, '2026-08-01');
});

test('recentLocalDays walks the calendar, so it crosses month and year boundaries', () => {
  const newYear = new Date(2027, 0, 1, 9, 0, 0); // Jan 1 2027
  assert.deepEqual(
    recentLocalDays(3, newYear).map((d) => d.date),
    ['2026-12-30', '2026-12-31', '2027-01-01']
  );

  // March 1 in a non-leap year must step back to Feb 28, not to a phantom Feb 29.
  const march = new Date(2026, 2, 1, 9, 0, 0);
  assert.deepEqual(
    recentLocalDays(2, march).map((d) => d.date),
    ['2026-02-28', '2026-03-01']
  );
});

test('recentLocalDays: consecutive entries are contiguous, no gap or overlap', () => {
  const days = recentLocalDays(5, new Date(2026, 7, 1, 20, 0, 0));
  assert.equal(days.length, 5);
  for (let i = 1; i < days.length; i++) {
    assert.equal(days[i].range.startMs, days[i - 1].range.endMs, `gap before ${days[i].date}`);
  }
});

test('recentLocalDays rejects a non-positive window instead of silently syncing nothing', () => {
  assert.throws(() => recentLocalDays(0, new Date()), /at least 1/);
  assert.throws(() => recentLocalDays(-2, new Date()), /at least 1/);
});
