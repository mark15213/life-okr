import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getLocalDayRange, getLocalDateString } from './ticktick-date';

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
