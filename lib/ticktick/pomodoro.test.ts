import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  DEFAULT_FOCUS_MINUTES,
  FOCUS_DURATION_OPTIONS,
  MIN_LOGGED_FOCUS_SECONDS,
  buildPendingFocus,
  focusMs,
  parseStoredPending,
  formatClock,
  isComplete,
  newBrowserSessionId,
  parseStoredSession,
  pauseSession,
  remainingMs,
  resolveOutcome,
  resumeSession,
  startSession,
  type PomodoroSession,
} from './pomodoro';

const T0 = 1_770_000_000_000; // an arbitrary fixed epoch, so nothing depends on the real clock
const MIN = 60_000;

function session(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return {
    sessionId: 'a'.repeat(24),
    taskId: 'task1',
    title: 'Renew the lease',
    list: 'life',
    durationMin: 25,
    startedAt: T0,
    pausedAt: null,
    pausedMs: 0,
    ...overrides,
  };
}

test('the default duration is one of the offered options', () => {
  assert.ok((FOCUS_DURATION_OPTIONS as readonly number[]).includes(DEFAULT_FOCUS_MINUTES));
});

test('newBrowserSessionId mints the same 24-hex shape TickTick accepts', () => {
  assert.match(newBrowserSessionId(), /^[0-9a-f]{24}$/);
  assert.notEqual(newBrowserSessionId(), newBrowserSessionId());
});

test('a session starts running, unpaused, at the moment it was started', () => {
  const s = startSession(
    { sessionId: 'b'.repeat(24), taskId: 't', title: 'x', list: 'work', durationMin: 45 },
    T0
  );

  assert.equal(s.startedAt, T0);
  assert.equal(s.pausedAt, null);
  assert.equal(s.pausedMs, 0);
  assert.equal(s.durationMin, 45);
});

test('focus time is read off the wall clock, not accumulated per tick', () => {
  // A throttled background tab stops firing timers; reading the clock keeps the count honest.
  assert.equal(focusMs(session(), T0 + 10 * MIN), 10 * MIN);
});

test('focus time stops advancing while paused', () => {
  const paused = pauseSession(session(), T0 + 10 * MIN);

  assert.equal(focusMs(paused, T0 + 10 * MIN), 10 * MIN);
  assert.equal(focusMs(paused, T0 + 30 * MIN), 10 * MIN);
});

test('resuming banks the paused span and carries on from where it stopped', () => {
  const paused = pauseSession(session(), T0 + 10 * MIN);
  const resumed = resumeSession(paused, T0 + 15 * MIN);

  assert.equal(resumed.pausedAt, null);
  assert.equal(resumed.pausedMs, 5 * MIN);
  assert.equal(focusMs(resumed, T0 + 16 * MIN), 11 * MIN);
});

test('pause and resume survive being repeated', () => {
  let s = session();
  s = pauseSession(s, T0 + 5 * MIN);
  s = resumeSession(s, T0 + 7 * MIN);
  s = pauseSession(s, T0 + 12 * MIN);
  s = resumeSession(s, T0 + 20 * MIN);

  assert.equal(s.pausedMs, 10 * MIN);
  assert.equal(focusMs(s, T0 + 21 * MIN), 11 * MIN);
});

test('pausing an already-paused session changes nothing', () => {
  const paused = pauseSession(session(), T0 + 5 * MIN);
  assert.deepEqual(pauseSession(paused, T0 + 9 * MIN), paused);
});

test('resuming a running session changes nothing', () => {
  const running = session();
  assert.deepEqual(resumeSession(running, T0 + 9 * MIN), running);
});

test('focus time never exceeds the duration that was set', () => {
  // The tab can be closed past the end and reopened much later; the extra hours are not focus.
  assert.equal(focusMs(session({ durationMin: 25 }), T0 + 3 * 60 * MIN), 25 * MIN);
});

test('remaining time counts down and then rests at zero', () => {
  assert.equal(remainingMs(session(), T0), 25 * MIN);
  assert.equal(remainingMs(session(), T0 + 10 * MIN), 15 * MIN);
  assert.equal(remainingMs(session(), T0 + 25 * MIN), 0);
  assert.equal(remainingMs(session(), T0 + 90 * MIN), 0);
});

test('a session is complete once its focus time reaches the duration', () => {
  assert.ok(!isComplete(session(), T0 + 24 * MIN));
  assert.ok(isComplete(session(), T0 + 25 * MIN));
});

test('a paused session never completes on its own', () => {
  const paused = pauseSession(session(), T0 + 10 * MIN);
  assert.ok(!isComplete(paused, T0 + 10 * 60 * MIN));
});

test('formatClock renders zero-padded minutes and seconds', () => {
  assert.equal(formatClock(25 * MIN), '25:00');
  assert.equal(formatClock(24 * MIN + 37_000), '24:37');
  assert.equal(formatClock(9_000), '00:09');
  assert.equal(formatClock(0), '00:00');
});

test('formatClock keeps counting in minutes past the hour', () => {
  assert.equal(formatClock(60 * MIN), '60:00');
  assert.equal(formatClock(95 * MIN), '95:00');
});

test('formatClock rounds up, so the clock shows 25:00 the instant a session starts', () => {
  // Rounding down would flash 24:59 immediately and end on 00:00 for a whole second.
  assert.equal(formatClock(24 * MIN + 59_500), '25:00');
});

test('a session run to completion logs exactly the duration it was set to', () => {
  const outcome = resolveOutcome(session(), T0 + 25 * MIN);

  assert.equal(outcome.startedAt, T0);
  assert.equal(outcome.endedAt, T0 + 25 * MIN);
  assert.equal(outcome.pausedSeconds, 0);
  assert.equal(outcome.focusSeconds, 25 * 60);
  assert.ok(outcome.loggable);
});

test('a session finished long after it was due ends when it was due, not now', () => {
  // The laptop slept through the end of the pomodoro. Logging "now" would credit hours of
  // focus that never happened.
  const outcome = resolveOutcome(session(), T0 + 5 * 60 * MIN);

  assert.equal(outcome.endedAt, T0 + 25 * MIN);
  assert.equal(outcome.focusSeconds, 25 * 60);
});

test('a session stopped early logs only the time actually spent', () => {
  const outcome = resolveOutcome(session(), T0 + 12 * MIN);

  assert.equal(outcome.endedAt, T0 + 12 * MIN);
  assert.equal(outcome.focusSeconds, 12 * 60);
  assert.ok(outcome.loggable);
});

test('a stopped session reports its paused span so the reader can net it out', () => {
  let s = session();
  s = pauseSession(s, T0 + 10 * MIN);
  s = resumeSession(s, T0 + 15 * MIN);
  const outcome = resolveOutcome(s, T0 + 20 * MIN);

  assert.equal(outcome.pausedSeconds, 5 * 60);
  assert.equal(outcome.focusSeconds, 15 * 60);
  // The invariant every reader relies on: wall-clock span minus pauses is the focus.
  assert.equal(
    (outcome.endedAt - outcome.startedAt) / 1000 - outcome.pausedSeconds,
    outcome.focusSeconds
  );
});

test('stopping while paused ends the session where the focus actually stopped', () => {
  // Paused at 10 minutes and walked away for an hour: the session ended at 10 minutes.
  const paused = pauseSession(session(), T0 + 10 * MIN);
  const outcome = resolveOutcome(paused, T0 + 70 * MIN);

  assert.equal(outcome.endedAt, T0 + 10 * MIN);
  assert.equal(outcome.pausedSeconds, 0);
  assert.equal(outcome.focusSeconds, 10 * 60);
});

test('a session too short to be worth recording is not loggable', () => {
  const outcome = resolveOutcome(session(), T0 + 20_000);

  assert.equal(outcome.focusSeconds, 20);
  assert.ok(!outcome.loggable);
});

test('the loggable threshold is inclusive at one minute', () => {
  assert.equal(MIN_LOGGED_FOCUS_SECONDS, 60);
  assert.ok(resolveOutcome(session(), T0 + MIN).loggable);
  assert.ok(!resolveOutcome(session(), T0 + MIN - 1000).loggable);
});

test('a stored session round-trips through JSON', () => {
  const s = pauseSession(session(), T0 + 5 * MIN);
  assert.deepEqual(parseStoredSession(JSON.parse(JSON.stringify(s))), s);
});

test('a corrupt stored session is discarded rather than resumed', () => {
  // Anything unusable here would wedge the panel on every load, with no way for the user
  // to clear it from the UI.
  assert.equal(parseStoredSession(null), null);
  assert.equal(parseStoredSession('nonsense'), null);
  assert.equal(parseStoredSession({}), null);
  assert.equal(parseStoredSession({ ...session(), sessionId: 'too-short' }), null);
  assert.equal(parseStoredSession({ ...session(), startedAt: 'yesterday' }), null);
  assert.equal(parseStoredSession({ ...session(), durationMin: 0 }), null);
  assert.equal(parseStoredSession({ ...session(), durationMin: -5 }), null);
  assert.equal(parseStoredSession({ ...session(), taskId: '' }), null);
  assert.equal(parseStoredSession({ ...session(), pausedMs: -1 }), null);
});

test('a finished session becomes the exact upload it needs, so a retry needs no recomputation', () => {
  let s = session();
  s = pauseSession(s, T0 + 10 * MIN);
  s = resumeSession(s, T0 + 15 * MIN);
  const pending = buildPendingFocus(s, resolveOutcome(s, T0 + 20 * MIN));

  assert.deepEqual(pending, {
    sessionId: 'a'.repeat(24),
    taskId: 'task1',
    title: 'Renew the lease',
    startedAt: T0,
    endedAt: T0 + 20 * MIN,
    pausedSeconds: 5 * 60,
    focusSeconds: 15 * 60,
  });
});

test('a pending upload round-trips through JSON', () => {
  const pending = buildPendingFocus(session(), resolveOutcome(session(), T0 + 25 * MIN));
  assert.deepEqual(parseStoredPending(JSON.parse(JSON.stringify(pending))), pending);
});

test('a corrupt pending upload is dropped rather than posted', () => {
  const pending = buildPendingFocus(session(), resolveOutcome(session(), T0 + 25 * MIN));

  assert.equal(parseStoredPending(null), null);
  assert.equal(parseStoredPending({}), null);
  assert.equal(parseStoredPending({ ...pending, sessionId: 'nope' }), null);
  assert.equal(parseStoredPending({ ...pending, taskId: '' }), null);
  assert.equal(parseStoredPending({ ...pending, endedAt: pending.startedAt }), null);
  assert.equal(parseStoredPending({ ...pending, pausedSeconds: -1 }), null);
  assert.equal(parseStoredPending({ ...pending, focusSeconds: 30 }), null);
});

test('a stored session with an unknown list keeps the session but drops the list', () => {
  // A renamed TickTick list should not throw away a pomodoro that is mid-flight.
  const parsed = parseStoredSession({ ...session(), list: 'errands' });
  assert.equal(parsed?.list, null);
  assert.equal(parsed?.taskId, 'task1');
});
