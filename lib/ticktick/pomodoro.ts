import { isTaskListKey, type TaskListKey } from './lists';

/**
 * Pomodoro timing, as pure functions over a serializable session.
 *
 * TickTick has no notion of a remotely-started timer — every client runs its own clock and
 * uploads the finished session — so the timer lives in the browser. Everything here is
 * derived from wall-clock instants rather than accumulated ticks, because a background tab
 * stops firing timers and a laptop can sleep straight through the end of a session.
 *
 * Browser-safe on purpose: no `node:crypto`, so the panel can import it directly.
 */

export const FOCUS_DURATION_OPTIONS = [15, 25, 45, 60] as const;
export const DEFAULT_FOCUS_MINUTES = 25;

/** Below this, a session is dropped rather than uploaded — seconds-long entries are noise. */
export const MIN_LOGGED_FOCUS_SECONDS = 60;

export const POMODORO_STORAGE_KEY = 'life-okr-pomodoro';
export const POMODORO_DURATION_KEY = 'life-okr-pomodoro-minutes';
export const POMODORO_PENDING_KEY = 'life-okr-pomodoro-pending';

export interface PomodoroSession {
  /** Minted once at start and reused on every retry, which makes the upload idempotent. */
  sessionId: string;
  taskId: string;
  title: string;
  list: TaskListKey | null;
  durationMin: number;
  startedAt: number;
  /** Epoch ms of the current pause, or null while running. */
  pausedAt: number | null;
  /** Paused ms already banked from earlier pauses, excluding the one in progress. */
  pausedMs: number;
}

export type StartSessionInput = Omit<PomodoroSession, 'startedAt' | 'pausedAt' | 'pausedMs'>;

export interface PomodoroOutcome {
  startedAt: number;
  endedAt: number;
  pausedSeconds: number;
  focusSeconds: number;
  loggable: boolean;
}

/** A 24-hex id in the shape TickTick accepts from clients, using the Web Crypto API. */
export function newBrowserSessionId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function startSession(input: StartSessionInput, now: number): PomodoroSession {
  return { ...input, startedAt: now, pausedAt: null, pausedMs: 0 };
}

export function pauseSession(session: PomodoroSession, now: number): PomodoroSession {
  if (session.pausedAt !== null) return session;
  return { ...session, pausedAt: now };
}

export function resumeSession(session: PomodoroSession, now: number): PomodoroSession {
  if (session.pausedAt === null) return session;
  return { ...session, pausedAt: null, pausedMs: session.pausedMs + (now - session.pausedAt) };
}

function durationMs(session: PomodoroSession): number {
  return session.durationMin * 60_000;
}

/**
 * Focus accrued so far, capped at the duration. The cap is what stops a tab that was left
 * open overnight from reporting eight hours of focus on a 25-minute pomodoro.
 */
export function focusMs(session: PomodoroSession, now: number): number {
  const stoppedAt = session.pausedAt ?? now;
  const raw = stoppedAt - session.startedAt - session.pausedMs;
  return Math.min(Math.max(raw, 0), durationMs(session));
}

export function remainingMs(session: PomodoroSession, now: number): number {
  return durationMs(session) - focusMs(session, now);
}

export function isComplete(session: PomodoroSession, now: number): boolean {
  return focusMs(session, now) >= durationMs(session);
}

/** mm:ss, rounded up so a session reads as its full length the instant it starts. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * What to upload for a session that is ending now.
 *
 * The end instant is not simply `now`: a session that was paused ended when it was paused,
 * and one that ran past its scheduled end (because the tab was closed, or the machine
 * slept) ended when it was due. Both clamps exist so the uploaded span can never contain
 * time the user did not spend.
 */
export function resolveOutcome(session: PomodoroSession, now: number): PomodoroOutcome {
  const scheduledEnd = session.startedAt + durationMs(session) + session.pausedMs;
  const endedAt = session.pausedAt ?? Math.min(now, scheduledEnd);

  const pausedSeconds = Math.round(session.pausedMs / 1000);
  const focusSeconds = Math.max(
    0,
    Math.round((endedAt - session.startedAt) / 1000) - pausedSeconds
  );

  return {
    startedAt: session.startedAt,
    endedAt,
    pausedSeconds,
    focusSeconds,
    loggable: focusSeconds >= MIN_LOGGED_FOCUS_SECONDS,
  };
}

/**
 * A finished session, frozen into exactly the body the upload needs.
 *
 * Kept as its own record so an upload that fails — an expired cookie is the likely reason —
 * can be retried later, or after a reload, without the timer state it came from. Focus that
 * was genuinely spent should never be lost to a bad network moment.
 */
export interface PendingFocus {
  sessionId: string;
  taskId: string;
  title: string;
  startedAt: number;
  endedAt: number;
  pausedSeconds: number;
  focusSeconds: number;
}

export function buildPendingFocus(
  session: PomodoroSession,
  outcome: PomodoroOutcome
): PendingFocus {
  return {
    sessionId: session.sessionId,
    taskId: session.taskId,
    title: session.title,
    startedAt: outcome.startedAt,
    endedAt: outcome.endedAt,
    pausedSeconds: outcome.pausedSeconds,
    focusSeconds: outcome.focusSeconds,
  };
}

/** Mirrors the server's own checks, so a corrupt record is dropped instead of posted. */
export function parseStoredPending(raw: unknown): PendingFocus | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  if (typeof value.sessionId !== 'string' || !/^[0-9a-f]{24}$/.test(value.sessionId)) return null;
  if (typeof value.taskId !== 'string' || !value.taskId) return null;
  if (typeof value.title !== 'string') return null;
  if (!isPositiveNumber(value.startedAt)) return null;
  if (!isPositiveNumber(value.endedAt) || value.endedAt <= value.startedAt) return null;

  const pausedSeconds = value.pausedSeconds;
  if (typeof pausedSeconds !== 'number' || !Number.isFinite(pausedSeconds) || pausedSeconds < 0) {
    return null;
  }

  const focusSeconds = value.focusSeconds;
  if (typeof focusSeconds !== 'number' || focusSeconds < MIN_LOGGED_FOCUS_SECONDS) return null;

  return {
    sessionId: value.sessionId,
    taskId: value.taskId,
    title: value.title,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    pausedSeconds,
    focusSeconds,
  };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Restore a session from storage, or give up on it.
 *
 * Returning null for anything unusable is deliberate: a malformed entry that threw, or that
 * restored half-initialized, would wedge the panel on every page load with nothing in the UI
 * able to clear it.
 */
export function parseStoredSession(raw: unknown): PomodoroSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  if (typeof value.sessionId !== 'string' || !/^[0-9a-f]{24}$/.test(value.sessionId)) return null;
  if (typeof value.taskId !== 'string' || !value.taskId) return null;
  if (typeof value.title !== 'string') return null;
  if (!isPositiveNumber(value.durationMin)) return null;
  if (!isPositiveNumber(value.startedAt)) return null;

  const pausedMs = value.pausedMs;
  if (typeof pausedMs !== 'number' || !Number.isFinite(pausedMs) || pausedMs < 0) return null;

  const pausedAt = value.pausedAt;
  if (pausedAt !== null && !isPositiveNumber(pausedAt)) return null;

  return {
    sessionId: value.sessionId,
    taskId: value.taskId,
    title: value.title,
    // A list that has since been renamed costs the dot, not the whole in-flight session.
    list: isTaskListKey(value.list) ? value.list : null,
    durationMin: value.durationMin,
    startedAt: value.startedAt,
    pausedAt: pausedAt as number | null,
    pausedMs,
  };
}
