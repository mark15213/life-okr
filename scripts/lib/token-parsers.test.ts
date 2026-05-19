import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { localDateOf } from './token-parsers';

test('localDateOf returns YYYY-MM-DD in process timezone', () => {
  // Use a UTC timestamp known to land on different dates depending on TZ.
  // 2026-05-19T03:00:00Z is May 18 in US Pacific, May 19 in UTC/Asia.
  const out = localDateOf('2026-05-19T03:00:00Z');
  assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
  // Reconstruct the expected local date from the same Date object the impl uses
  const d = new Date('2026-05-19T03:00:00Z');
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(out, expected);
});

test('localDateOf zero-pads single-digit month and day', () => {
  // Pick a UTC instant whose local-date components are single-digit in some TZs.
  // We rebuild the expected string the same way the implementation does, so the
  // test stays portable, but we explicitly assert the digit count of the components.
  const iso = '2026-03-05T12:00:00Z';
  const out = localDateOf(iso);
  const d = new Date(iso);
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(out, expected);
  const [, mm, dd] = out.split('-');
  assert.equal(mm.length, 2);
  assert.equal(dd.length, 2);
});

test('localDateOf throws on invalid input', () => {
  assert.throws(() => localDateOf('not-a-date'));
});
