import type { TaskListKey } from './lists';

/**
 * The shape the panel renders and the buckets it renders into.
 *
 * Split out from `tasks.ts` because the panel is a client component and `tasks.ts` reads
 * `process.env.APP_TZ` — the same boundary that keeps postgres out of the client bundle for
 * `withTicktickSummed`. Everything here is a plain value with no environment behind it.
 */

/** Buckets the panel renders, in display order. */
export const TASK_GROUPS = ['overdue', 'today', 'tomorrow', 'later', 'undated'] as const;
export type TaskGroup = (typeof TASK_GROUPS)[number];

export const TASK_GROUP_LABELS: Record<TaskGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  later: 'Later',
  undated: 'No date',
};

/** What the API route hands the browser. Grouping and labels are resolved server-side. */
export interface PanelTask {
  id: string;
  title: string;
  projectId: string | null;
  list: TaskListKey | null;
  priority: number;
  group: TaskGroup;
  /** Short human label for the due chip, e.g. "14:30", "Tomorrow", "Aug 9". Null when undated. */
  dueLabel: string | null;
  /** Effective due instant in epoch ms, after the all-day correction. Null when undated. */
  dueAt: number | null;
}

/**
 * Sort by the shared order; anything the order has never seen keeps its incoming position at
 * the back. Deliberately the same rule as `FocusEngine.applyOrder` on iOS, so a task added on
 * one device lands in the same slot on the other.
 */
export function applyQueueOrder<T extends { id: string }>(items: T[], order: string[] | null): T[] {
    if (!order || order.length === 0) return items;
    const rank = new Map<string, number>();
    order.forEach((id, index) => { if (!rank.has(id)) rank.set(id, index); });
    return items
        .map((item, index) => ({ item, rank: rank.get(item.id) ?? order.length + index }))
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => entry.item);
}
