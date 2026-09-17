import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppStateKey, parseFocusSession, parseQueueOrder } from './app-state';

test('only the two known keys are accepted', () => {
  assert.equal(isAppStateKey('queue-order'), true);
  assert.equal(isAppStateKey('focus-session'), true);
  assert.equal(isAppStateKey('anything-else'), false);
  assert.equal(isAppStateKey(42), false);
});

test('queue order is a list of unique non-empty ids', () => {
  assert.deepEqual(parseQueueOrder({ order: ['a', 'b'] }), { order: ['a', 'b'] });
  assert.deepEqual(parseQueueOrder({ order: [] }), { order: [] });
  assert.equal(parseQueueOrder({ order: ['a', 'a'] }), null);
  assert.equal(parseQueueOrder({ order: ['a', ''] }), null);
  assert.equal(parseQueueOrder({ order: [1] }), null);
  assert.equal(parseQueueOrder({ order: 'a,b' }), null);
  assert.equal(parseQueueOrder(null), null);
});

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'round-1',
    durationMs: 30 * 60_000,
    status: 'running',
    startedAt: 1_000_000,
    elapsedMs: 696_000,
    asOf: 1_700_000,
    selectedTaskId: 'task-a',
    device: 'iPhone',
    segments: [
      { id: 's1', taskId: 'task-b', title: 'Review PR #142', list: 'work', startedAt: 1_000_000, durationMs: 316_000 },
      { id: 's2', taskId: 'task-a', title: '写周报', list: 'work', startedAt: 1_316_000, durationMs: 380_000 },
    ],
    ...overrides,
  };
}

test('null means nothing is running', () => {
  assert.deepEqual(parseFocusSession(null), { ok: true, value: null });
});

test('a consistent session round-trips', () => {
  const result = parseFocusSession(session());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value?.segments.length, 2);
  assert.equal(result.value?.selectedTaskId, 'task-a');
  assert.equal(result.value?.device, 'iPhone');
});

test('segments must add up to elapsed time', () => {
  const result = parseFocusSession(session({ elapsedMs: 100_000 }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /add up/);
});

test('a finished pomodoro is not stored as a session', () => {
  assert.equal(parseFocusSession(session({ elapsedMs: 31 * 60_000 })).ok, false);
});

test('duration is one of the fixed pomodoro lengths', () => {
  assert.equal(parseFocusSession(session({ durationMs: 17 * 60_000 })).ok, false);
});

test('an unknown list on a segment is dropped, not fatal', () => {
  const result = parseFocusSession(session({
    elapsedMs: 5_000,
    segments: [{ id: 's', taskId: 't', title: 'x', list: 'gardening', startedAt: 1_000_000, durationMs: 5_000 }],
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value?.segments[0].list, null);
});

test('a segment with no task is allowed (queue was empty)', () => {
  const result = parseFocusSession(session({
    selectedTaskId: null,
    elapsedMs: 5_000,
    segments: [{ id: 's', taskId: null, title: '', list: null, startedAt: 1_000_000, durationMs: 5_000 }],
  }));
  assert.equal(result.ok, true);
});
