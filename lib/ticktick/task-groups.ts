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
