import type { TaskListKey } from './lists';
import { TASK_GROUPS, type PanelTask, type TaskGroup } from './task-groups';
import { APP_TZ } from '../app-tz';

export { APP_TZ };

export type { PanelTask, TaskGroup };

/** The subset of TickTick's task object we read. Everything else is passed through untouched. */
export interface RawTickTickTask {
  id: string;
  title?: string | null;
  projectId?: string | null;
  status?: number;
  deleted?: number;
  priority?: number;
  dueDate?: string | null;
  isAllDay?: boolean | null;
  createdTime?: string | null;
  [key: string]: unknown;
}

function ymd(ms: number, timeZone: string): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone });
}

function shiftDays(ymdString: string, days: number): string {
  const [y, m, d] = ymdString.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * The due instant to reason about, in epoch ms.
 *
 * All-day tasks store an *exclusive* end boundary: a task due Aug 3 comes back as
 * `2026-08-03T16:00:00.000+0000`, which is midnight Aug 4 in Asia/Shanghai. Formatting that
 * instant directly puts every all-day task one day late. Backing off a millisecond lands it
 * on the last instant of the intended day, which formats correctly in any timezone.
 */
export function effectiveDueMs(task: RawTickTickTask): number | null {
  if (!task.dueDate) return null;
  const ms = Date.parse(task.dueDate);
  if (!Number.isFinite(ms)) return null;
  return task.isAllDay ? ms - 1 : ms;
}

export function classifyDue(
  task: RawTickTickTask,
  now: Date,
  timeZone: string = APP_TZ
): TaskGroup {
  const dueMs = effectiveDueMs(task);
  if (dueMs === null) return 'undated';

  const today = ymd(now.getTime(), timeZone);
  const dueDay = ymd(dueMs, timeZone);

  if (dueDay < today) return 'overdue';
  // A timed task whose moment has passed is overdue even though it is still "today" — that is
  // what every TickTick client shows, and the panel captures everything as due right now, so
  // without this the whole capture flow would sit permanently under a calm "Today" heading.
  if (!task.isAllDay && dueMs < now.getTime()) return 'overdue';
  if (dueDay === today) return 'today';
  if (dueDay === shiftDays(today, 1)) return 'tomorrow';
  return 'later';
}

export function formatDueLabel(
  task: RawTickTickTask,
  now: Date,
  timeZone: string = APP_TZ
): string | null {
  const dueMs = effectiveDueMs(task);
  if (dueMs === null) return null;

  const today = ymd(now.getTime(), timeZone);
  const dueDay = ymd(dueMs, timeZone);

  if (task.isAllDay) {
    if (dueDay === today) return 'Today';
    if (dueDay === shiftDays(today, 1)) return 'Tomorrow';
    if (dueDay === shiftDays(today, -1)) return 'Yesterday';
    return new Date(dueMs).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' });
  }

  const time = new Date(dueMs).toLocaleTimeString('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
  if (dueDay === today) return time;
  if (dueDay === shiftDays(today, 1)) return `Tomorrow ${time}`;

  const date = new Date(dueMs).toLocaleDateString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  });
  return `${date} ${time}`;
}

export function toPanelTask(
  task: RawTickTickTask,
  listKeyByProjectId: Map<string, TaskListKey>,
  now: Date,
  timeZone: string = APP_TZ
): PanelTask {
  return {
    id: task.id,
    title: (task.title ?? '').trim() || '(untitled)',
    projectId: task.projectId ?? null,
    list: (task.projectId && listKeyByProjectId.get(task.projectId)) || null,
    priority: task.priority ?? 0,
    group: classifyDue(task, now, timeZone),
    dueLabel: formatDueLabel(task, now, timeZone),
    dueAt: effectiveDueMs(task),
  };
}

export function isOpenTask(task: RawTickTickTask): boolean {
  return task.status === 0 && !task.deleted;
}

/**
 * Soonest first, then most urgent. Undated tasks sort by priority alone and land last via
 * their group. Ties break on id so repeated fetches never reshuffle rows under the cursor.
 */
export function sortPanelTasks(tasks: PanelTask[]): PanelTask[] {
  const order = new Map(TASK_GROUPS.map((g, i) => [g, i]));
  return [...tasks].sort((a, b) => {
    const byGroup = (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0);
    if (byGroup !== 0) return byGroup;

    if (a.dueAt !== null && b.dueAt !== null && a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;

    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}
