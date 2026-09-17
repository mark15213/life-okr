/**
 * Small shared-state store for things every client (web, desktop, iOS) must agree on but
 * that TickTick does not model: the user's own priority order of the task queue, and the
 * single pomodoro that may be running right now.
 *
 * One table, `app_state`, keyed by name with a JSONB value. Two keys are allowed and each
 * has a validator, so a client can never write a shape the other clients cannot read.
 *
 * Validation lives here as pure functions so it is unit-testable without a database.
 */
import { sql } from './db';
import { isTaskListKey, type TaskListKey } from './ticktick/lists';

export const APP_STATE_KEYS = ['queue-order', 'focus-session'] as const;
export type AppStateKey = (typeof APP_STATE_KEYS)[number];

export function isAppStateKey(value: unknown): value is AppStateKey {
  return typeof value === 'string' && (APP_STATE_KEYS as readonly string[]).includes(value);
}

/** The user's priority order: TickTick task ids, top of the queue first. */
export interface QueueOrder {
  order: string[];
}

/** One stretch of a pomodoro spent on one task. Wall-clock ms; durationMs excludes pauses. */
export interface FocusSegment {
  id: string;
  taskId: string | null;
  title: string;
  list: TaskListKey | null;
  startedAt: number;
  durationMs: number;
}

/**
 * The one pomodoro that may be running. There is never more than one across all clients.
 *
 * Time is reported as `elapsedMs` at `asOf`, not derived from `startedAt`, because pauses
 * make the wall clock useless for the countdown. A client that reads a running session
 * continues it from `elapsedMs + (now - asOf)`.
 */
export interface FocusSession {
  id: string;
  durationMs: number;
  status: 'running' | 'paused';
  startedAt: number;
  elapsedMs: number;
  asOf: number;
  selectedTaskId: string | null;
  segments: FocusSegment[];
  /** Which client last wrote this, for display only ("started on iPhone"). */
  device: string;
}

export const MAX_QUEUE_IDS = 2000;
export const MAX_SEGMENTS = 200;
export const ALLOWED_DURATIONS_MS = [15, 25, 30, 45, 60].map((m) => m * 60_000);

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseQueueOrder(raw: unknown): QueueOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const order = (raw as { order?: unknown }).order;
  if (!Array.isArray(order) || order.length > MAX_QUEUE_IDS) return null;
  const seen = new Set<string>();
  for (const id of order) {
    if (typeof id !== 'string' || !id || id.length > 64 || seen.has(id)) return null;
    seen.add(id);
  }
  return { order: [...(order as string[])] };
}

function parseSegment(raw: unknown): FocusSegment | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== 'string' || !s.id) return null;
  if (s.taskId !== null && (typeof s.taskId !== 'string' || !s.taskId)) return null;
  if (typeof s.title !== 'string') return null;
  if (!finite(s.startedAt) || s.startedAt <= 0) return null;
  if (!finite(s.durationMs) || s.durationMs < 0) return null;
  return {
    id: s.id,
    taskId: s.taskId as string | null,
    title: s.title.slice(0, 500),
    list: isTaskListKey(s.list) ? s.list : null,
    startedAt: s.startedAt,
    durationMs: s.durationMs,
  };
}

/**
 * Accepts a session or `null` (nothing running). Rejects anything internally inconsistent:
 * the segments must sum to the elapsed time (within a second of rounding), and elapsed can
 * never exceed the duration — a completed pomodoro is deleted, not stored as 100%.
 */
export function parseFocusSession(raw: unknown): { ok: true; value: FocusSession | null } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: null };
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'session must be an object or null' };
  const v = raw as Record<string, unknown>;

  if (typeof v.id !== 'string' || !v.id) return { ok: false, error: 'id is required' };
  if (!finite(v.durationMs) || !ALLOWED_DURATIONS_MS.includes(v.durationMs)) {
    return { ok: false, error: 'durationMs must be one of 15/25/30/45/60 minutes' };
  }
  if (v.status !== 'running' && v.status !== 'paused') return { ok: false, error: 'status must be running or paused' };
  if (!finite(v.startedAt) || v.startedAt <= 0) return { ok: false, error: 'startedAt must be epoch ms' };
  if (!finite(v.asOf) || v.asOf < v.startedAt) return { ok: false, error: 'asOf must be epoch ms, not before startedAt' };
  if (!finite(v.elapsedMs) || v.elapsedMs < 0 || v.elapsedMs > v.durationMs) {
    return { ok: false, error: 'elapsedMs must be within [0, durationMs]' };
  }
  if (v.selectedTaskId !== null && (typeof v.selectedTaskId !== 'string' || !v.selectedTaskId)) {
    return { ok: false, error: 'selectedTaskId must be a task id or null' };
  }
  if (!Array.isArray(v.segments) || v.segments.length > MAX_SEGMENTS) return { ok: false, error: 'segments must be an array' };

  const segments: FocusSegment[] = [];
  let sum = 0;
  for (const raw of v.segments) {
    const seg = parseSegment(raw);
    if (!seg) return { ok: false, error: 'a segment is malformed' };
    segments.push(seg);
    sum += seg.durationMs;
  }
  if (Math.abs(sum - v.elapsedMs) > 1000) return { ok: false, error: 'segments do not add up to elapsedMs' };

  return {
    ok: true,
    value: {
      id: v.id,
      durationMs: v.durationMs,
      status: v.status,
      startedAt: v.startedAt,
      elapsedMs: v.elapsedMs,
      asOf: v.asOf,
      selectedTaskId: v.selectedTaskId as string | null,
      segments,
      device: typeof v.device === 'string' ? v.device.slice(0, 64) : 'unknown',
    },
  };
}

export interface StoredState<T> {
  value: T;
  /** Increments on every write. Send it back as `ifVersion` to write only if nobody else has. */
  version: number;
  updatedAt: number;
}

function toStored<T>(row: Record<string, unknown>): StoredState<T> {
  return {
    value: row.value as T,
    version: Number(row.version),
    updatedAt: new Date(row.updated_at as string | Date).getTime(),
  };
}

export async function readAppState<T>(key: AppStateKey): Promise<StoredState<T> | null> {
  const rows = await sql`SELECT value, version, updated_at FROM app_state WHERE key = ${key}`;
  return rows[0] ? toStored<T>(rows[0] as Record<string, unknown>) : null;
}

/**
 * Write with optional optimistic concurrency: when `ifVersion` is given and the stored row
 * has moved past it, nothing is written and `null` comes back so the caller can 409. Two
 * phones reordering the queue at once therefore cannot silently clobber each other.
 * `ifVersion: 0` means "only if the key does not exist yet".
 */
export async function writeAppState<T>(
  key: AppStateKey,
  value: T,
  ifVersion?: number
): Promise<StoredState<T> | null> {
  const json = JSON.stringify(value);
  const rows = ifVersion === undefined
    ? await sql`
        INSERT INTO app_state (key, value, version, updated_at) VALUES (${key}, ${json}::jsonb, 1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, version = app_state.version + 1, updated_at = NOW()
        RETURNING value, version, updated_at`
    : await sql`
        INSERT INTO app_state (key, value, version, updated_at) VALUES (${key}, ${json}::jsonb, 1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, version = app_state.version + 1, updated_at = NOW()
        WHERE app_state.version = ${ifVersion}
        RETURNING value, version, updated_at`;
  return rows[0] ? toStored<T>(rows[0] as Record<string, unknown>) : null;
}
