import {
  CATEGORIES,
  categoryFromProjectName,
  countCompletedTasksByCategory,
  emptyCategoryTotals,
  sumFocusMinutesByCategory,
  type CategorizedTotal,
  type Category,
  type TickTickPomodoro,
  type TickTickTask,
} from './aggregate';
import {
  fetchCompletedTasks,
  fetchPomodoroTimeline,
  fetchSnapshot,
} from './client';
import { getDateString, recentDays, type LocalDay } from './day';
import { APP_TZ } from '../app-tz';

export { APP_TZ };

export interface CategoryTotalsRow {
  focusMinutes: number;
  tasksCompleted: number;
}

export interface PlannedWrite {
  date: string;
  focusMinutes: number;
  tasksCompleted: number;
  byCategory: Record<Category, CategoryTotalsRow>;
}

export interface SyncPlan {
  writes: PlannedWrite[];
  skipped: string[];
}

const EMPTY: CategorizedTotal = { total: 0, byCategory: emptyCategoryTotals() };

/**
 * Decide what to store for each day in the window.
 *
 * Today is always written, so deleting a session in TickTick can bring the stored value back
 * down. A *past* day reporting all-zero is skipped instead: zero there is ambiguous between
 * "genuinely empty" and "the timeline no longer reaches back this far", and this sync has
 * already destroyed two weeks of history once by resolving that ambiguity the wrong way.
 * Filling a gap is safe; zeroing a settled day is not.
 */
export function planSync(
  days: LocalDay[],
  focusByDay: Map<string, CategorizedTotal>,
  tasksByDay: Map<string, CategorizedTotal>,
  today: string
): SyncPlan {
  const writes: PlannedWrite[] = [];
  const skipped: string[] = [];

  for (const { date } of days) {
    const focus = focusByDay.get(date) ?? EMPTY;
    const tasks = tasksByDay.get(date) ?? EMPTY;

    if (date !== today && focus.total === 0 && tasks.total === 0) {
      skipped.push(date);
      continue;
    }

    const byCategory = Object.fromEntries(
      CATEGORIES.map((category) => [
        category,
        {
          focusMinutes: focus.byCategory[category],
          tasksCompleted: tasks.byCategory[category],
        },
      ])
    ) as Record<Category, CategoryTotalsRow>;

    writes.push({
      date,
      focusMinutes: focus.total,
      tasksCompleted: tasks.total,
      byCategory,
    });
  }

  return { writes, skipped };
}

/** `YYYY-MM-DD HH:mm:ss` wall clock in `timeZone`; the completed-tasks endpoint wants this. */
function wallClock(instant: Date, timeZone: string): string {
  return instant.toLocaleString('sv-SE', { timeZone });
}

export interface SyncOptions {
  cookie: string;
  dayCount?: number;
  timeZone?: string;
  now?: Date;
  /** Injected so this module carries no database import — the CLI must load dotenv first. */
  upsert: (
    date: string,
    focusMinutes: number,
    tasksCompleted: number,
    byCategory: Record<Category, CategoryTotalsRow>
  ) => Promise<void>;
  onLog?: (message: string) => void;
}

export interface SyncResult extends SyncPlan {
  days: string[];
}

/**
 * Recompute a trailing window from TickTick and store the result.
 *
 * The single implementation behind both callers — the laptop's cron and the web app's
 * post-write refresh — because the value written is absolute, not incremental: whoever runs
 * this last simply restates the same recomputed total. Two implementations that drifted
 * apart would not double-count, but they would take turns overwriting each other with
 * different numbers, which is just as wrong and much harder to notice.
 *
 * Everything is keyed off `timeZone` rather than the process clock, so a UTC serverless
 * runtime and a laptop in Asia/Shanghai agree on which day a session belongs to.
 */
export async function syncWindow(options: SyncOptions): Promise<SyncResult> {
  const timeZone = options.timeZone ?? APP_TZ;
  const now = options.now ?? new Date();
  const days = recentDays(options.dayCount ?? 3, now, timeZone);
  const log = options.onLog ?? (() => {});

  // Fetched first and awaited: a failure here must not stop the totals being written, so it
  // degrades to "everything uncategorized" rather than aborting the run.
  let projectMap = new Map<string, Category>();
  try {
    const snapshot = await fetchSnapshot(options.cookie);
    for (const [projectId, name] of snapshot.projectNameById) {
      const category = categoryFromProjectName(name);
      if (category !== 'uncategorized') projectMap.set(projectId, category);
    }
  } catch (error) {
    log(
      `could not load TickTick lists, categorizing everything as uncategorized: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    projectMap = new Map();
  }

  const from = wallClock(new Date(days[0].range.startMs), timeZone);
  const to = wallClock(new Date(days[days.length - 1].range.endMs - 1), timeZone);

  const [pomodoros, completed] = await Promise.all([
    fetchPomodoroTimeline(options.cookie, now.getTime()),
    fetchCompletedTasks(options.cookie, from, to, 200 * days.length),
  ]);

  const focusByDay = new Map<string, CategorizedTotal>(
    days.map((d) => [d.date, sumFocusMinutesByCategory(pomodoros as TickTickPomodoro[], d.range)])
  );
  const tasksByDay = new Map<string, CategorizedTotal>(
    days.map((d) => [
      d.date,
      countCompletedTasksByCategory(completed as TickTickTask[], d.range, projectMap),
    ])
  );

  const plan = planSync(days, focusByDay, tasksByDay, getDateString(now, timeZone));

  for (const write of plan.writes) {
    await options.upsert(write.date, write.focusMinutes, write.tasksCompleted, write.byCategory);
  }

  return { ...plan, days: days.map((d) => d.date) };
}
