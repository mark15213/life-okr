import {
  buildListKeyByProjectId,
  buildProjectIdByListKey,
  type ProjectProfile,
  type TaskListKey,
} from './lists';
import { buildClosePayload, type TaskOutcome } from './payloads';
import { isOpenTask, type RawTickTickTask } from './tasks';

const API_BASE = 'https://api.ticktick.com/api/v2';

/** The unofficial API refuses requests without a device header. */
const X_DEVICE = JSON.stringify({
  platform: 'web',
  os: 'macOS',
  device: 'Chrome',
  name: '',
  version: 4531,
  id: '',
  channel: 'website',
  campaign: '',
  websocket: '',
});

export class TickTickAuthError extends Error {
  constructor() {
    super('TickTick rejected the stored cookie. Refresh TICKTICK_COOKIE with a new `t=` value.');
    this.name = 'TickTickAuthError';
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One authenticated call, retried on transport failures.
 *
 * Local TUN-mode proxies drop the occasional connection before TLS is even established, which
 * surfaces as a bare `fetch failed` rather than an HTTP status. Those retries succeed instantly,
 * so a short backoff is enough; genuine 4xx responses are never retried.
 */
async function request(
  cookie: string,
  path: string,
  init: RequestInit = {},
  attempts = 3
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await delay(250 * attempt);

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Cookie: cookie,
          'x-device': X_DEVICE,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      lastError = error;
      continue;
    }

    if (res.status === 401 || res.status === 403) throw new TickTickAuthError();

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      lastError = new Error(`TickTick ${path} -> ${res.status} ${detail.slice(0, 200)}`);
      if (RETRYABLE_STATUS.has(res.status)) continue;
      throw lastError;
    }

    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`TickTick ${path} failed`);
}

interface BatchCheckResponse {
  syncTaskBean?: { update?: RawTickTickTask[] };
  projectProfiles?: ProjectProfile[];
  inboxId?: string;
}

export interface TickTickSnapshot {
  /** Every open (not completed, not deleted) task in the account. */
  openTasks: RawTickTickTask[];
  listKeyByProjectId: Map<string, TaskListKey>;
  projectIdByListKey: Map<TaskListKey, string>;
  /** projectId → the list name as TickTick spells it. Focus sessions are keyed by name. */
  projectNameById: Map<string, string>;
}

/**
 * The whole account in one call. `batch/check/0` is the same endpoint the web client boots
 * from: it returns every task plus the list metadata needed to interpret them, which saves a
 * second round trip for project names on a link where round trips are the expensive part.
 */
export async function fetchSnapshot(cookie: string): Promise<TickTickSnapshot> {
  const body = (await request(cookie, '/batch/check/0')) as BatchCheckResponse | null;

  const profiles = body?.projectProfiles ?? [];
  const inboxId = body?.inboxId ?? null;

  const projectNameById = new Map<string, string>();
  for (const profile of profiles) {
    if (profile?.id && profile.name) projectNameById.set(profile.id, profile.name);
  }
  if (inboxId) projectNameById.set(inboxId, 'Inbox');

  return {
    openTasks: (body?.syncTaskBean?.update ?? []).filter(isOpenTask),
    listKeyByProjectId: buildListKeyByProjectId(profiles, inboxId),
    projectIdByListKey: buildProjectIdByListKey(profiles, inboxId),
    projectNameById,
  };
}

/**
 * Every focus session the account will admit to, newest first. The endpoint caps how far
 * back it reaches (roughly ten days on this account), which is why a past day reporting
 * nothing is treated as unknown rather than as zero.
 */
export async function fetchPomodoroTimeline(cookie: string, toMs: number): Promise<unknown[]> {
  const body = await request(cookie, `/pomodoros/timeline?to=${toMs}`);
  return Array.isArray(body) ? body : [];
}

/**
 * Completed tasks in a window, Inbox included — which is the whole reason this runs on the
 * unofficial API. `from`/`to` are local wall-clock strings, not epoch ms; sending epoch ms
 * returns HTTP 500. The limit is per request rather than per day.
 */
export async function fetchCompletedTasks(
  cookie: string,
  from: string,
  to: string,
  limit: number
): Promise<unknown[]> {
  const path =
    `/project/all/completed/?from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}&limit=${limit}`;
  const body = await request(cookie, path);
  return Array.isArray(body) ? body : [];
}

export async function createTask(
  cookie: string,
  payload: Record<string, unknown>
): Promise<void> {
  await request(cookie, '/batch/task', {
    method: 'POST',
    body: JSON.stringify({ add: [payload], update: [], delete: [], addAttachments: [] }),
  });
}

/**
 * Close a task — done, or won't do. The batch endpoint replaces rather than patches, so the
 * task is read back first: sending a hand-built stub would blank out its content, tags and
 * reminders. Reading it back is also what makes `TaskNotFoundError` meaningful — a task that
 * is no longer open cannot be closed twice.
 */
export async function closeTask(
  cookie: string,
  taskId: string,
  outcome: TaskOutcome,
  closedAt: Date
): Promise<RawTickTickTask> {
  const snapshot = await fetchSnapshot(cookie);
  const task = snapshot.openTasks.find((t) => t.id === taskId);
  if (!task) throw new TaskNotFoundError(taskId);

  await request(cookie, '/batch/task', {
    method: 'POST',
    body: JSON.stringify({
      add: [],
      update: [buildClosePayload(task, outcome, closedAt)],
      delete: [],
      addAttachments: [],
    }),
  });

  return task;
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} is not an open task in TickTick (already done, or deleted).`);
    this.name = 'TaskNotFoundError';
  }
}

export async function postFocusSession(
  cookie: string,
  payload: Record<string, unknown>
): Promise<void> {
  await request(cookie, '/batch/pomodoro', {
    method: 'POST',
    body: JSON.stringify({ add: [payload], update: [] }),
  });
}
