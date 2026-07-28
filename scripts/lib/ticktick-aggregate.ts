import type { LocalDayRange } from './ticktick-date';

export const CATEGORIES = ['work', 'study', 'hustle', 'life', 'uncategorized'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories that carry a real TickTick list behind them, in stable tie-break order. */
const NAMED_CATEGORIES = ['work', 'study', 'hustle', 'life'] as const;

export type CategoryTotals = Record<Category, number>;

export interface CategorizedTotal {
  total: number;
  byCategory: CategoryTotals;
}

export function emptyCategoryTotals(): CategoryTotals {
  return { work: 0, study: 0, hustle: 0, life: 0, uncategorized: 0 };
}

/**
 * Map a TickTick list name onto one of our categories. The user's four lists are
 * literally named Work / Study / Hustle / Life; anything else — Inbox (which the API
 * localizes, e.g. "收集箱" vs "Inbox"), or any list we don't know — falls through to
 * `uncategorized`, so Inbox needs no special case.
 */
export function categoryFromProjectName(name: string | null | undefined): Category {
  const key = (name ?? '').trim().toLowerCase();
  for (const c of NAMED_CATEGORIES) {
    if (key === c) return c;
  }
  return 'uncategorized';
}

export interface TickTickTask {
  status: number;
  completedTime: string | null;
  projectId?: string;
}

/** One task worked on inside a focus session. Note: no `projectId` here — only the name. */
export interface TickTickPomodoroTask {
  taskId?: string;
  title?: string;
  projectName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface TickTickPomodoro {
  startTime: string;
  endTime: string;
  pauseDuration?: number; // seconds paused mid-session
  tasks?: TickTickPomodoroTask[];
}

/**
 * Effective focus seconds for one session, or null if the session is malformed or did
 * not start inside `range`. Sessions are bucketed by the day they *started* in and are
 * never clipped, so a 23:40→00:20 session counts entirely toward the start day.
 *
 * Both the grand total and the per-category split go through this one helper on purpose:
 * if a future change starts filtering on `status`/`type`/`adjustTime`, it cannot be
 * applied to one path and not the other, which would break the reconciliation invariant.
 */
function sessionSecondsInRange(p: TickTickPomodoro, range: LocalDayRange): number | null {
  const startMs = new Date(p.startTime).getTime();
  const endMs = new Date(p.endTime).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  if (startMs < range.startMs || startMs >= range.endMs) return null;
  return Math.max(0, Math.round((endMs - startMs) / 1000) - (p.pauseDuration ?? 0));
}

/**
 * Weight (not duration!) of each `tasks[]` entry within a session, used only to decide
 * how the session's effective seconds are shared out. Entry spans can overlap each other
 * or under-fill the session; normalizing rather than clipping is self-healing for both.
 *
 * `new Date(null).getTime()` is 0, not NaN — a still-running entry with `endTime: null`
 * would otherwise produce a weight around -1.8e12 and poison the whole normalization.
 */
function entryWeights(entries: TickTickPomodoroTask[]): number[] {
  return entries.map((e) => {
    const s = new Date(e.startTime ?? '').getTime();
    const t = new Date(e.endTime ?? '').getTime();
    if (!Number.isFinite(s) || !Number.isFinite(t)) return 0;
    return Math.max(0, t - s);
  });
}

/** Share one session's seconds across its tasks, accumulating into `acc`. */
function splitSessionSeconds(
  p: TickTickPomodoro,
  seconds: number,
  acc: Map<Category, number>
): void {
  const entries = p.tasks ?? [];
  if (entries.length === 0) {
    acc.set('uncategorized', (acc.get('uncategorized') ?? 0) + seconds);
    return;
  }

  const weights = entryWeights(entries);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  // Instant task switches (startTime === endTime) zero out every weight. Dividing by that
  // yields NaN, which would reach an INT column and abort the whole sync transaction —
  // taking the totals write down with it. Fall back to an even split.
  const useEqual = totalWeight <= 0;

  entries.forEach((e, i) => {
    const share = useEqual ? seconds / entries.length : (seconds * weights[i]) / totalWeight;
    const cat = categoryFromProjectName(e.projectName);
    acc.set(cat, (acc.get(cat) ?? 0) + share);
  });
}

/**
 * Split an already-computed integer `total` across categories in proportion to `weights`,
 * using largest-remainder (Hamilton) apportionment so the parts sum to `total` exactly.
 *
 * Rounding each category independently and summing would drift by up to ~2.5 minutes a day
 * and would make the stored total depend on how the day happened to partition — the sync
 * reruns every 15 minutes, so the total would wobble with no real activity, and
 * FloatingVault floors focus minutes into reward currency.
 */
function apportion(total: number, weights: CategoryTotals): CategoryTotals {
  const out = emptyCategoryTotals();
  const totalWeight = CATEGORIES.reduce((s, c) => s + weights[c], 0);
  if (total <= 0 || totalWeight <= 0) return out;

  const remainders: Array<{ category: Category; frac: number }> = [];
  let assigned = 0;
  for (const c of CATEGORIES) {
    const exact = (total * weights[c]) / totalWeight;
    const floored = Math.floor(exact);
    out[c] = floored;
    assigned += floored;
    remainders.push({ category: c, frac: exact - floored });
  }

  // Hand out the leftover units to the largest fractional remainders. CATEGORIES order is
  // the tie-break, so the result is deterministic across runs.
  remainders.sort((a, b) => b.frac - a.frac);
  let leftover = total - assigned;
  for (let i = 0; leftover > 0 && i < remainders.length; i++, leftover--) {
    out[remainders[i].category] += 1;
  }
  return out;
}

export function countCompletedTasksToday(tasks: TickTickTask[], range: LocalDayRange): number {
  let count = 0;
  for (const t of tasks) {
    if (t.status !== 2) continue;
    if (!t.completedTime) continue;
    const ms = new Date(t.completedTime).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= range.startMs && ms < range.endMs) count++;
  }
  return count;
}

export function sumFocusMinutesToday(pomodoros: TickTickPomodoro[], range: LocalDayRange): number {
  let totalSeconds = 0;
  for (const p of pomodoros) {
    const seconds = sessionSecondsInRange(p, range);
    if (seconds === null) continue;
    totalSeconds += seconds;
  }
  return Math.round(totalSeconds / 60);
}

/**
 * Completed-task count broken down by the list each task lives in. Applies exactly the same
 * filter as `countCompletedTasksToday`, so `total` is identical to it on the same input.
 */
export function countCompletedTasksByCategory(
  tasks: TickTickTask[],
  range: LocalDayRange,
  projectIdToCategory: Map<string, Category>
): CategorizedTotal {
  const byCategory = emptyCategoryTotals();
  let total = 0;
  for (const t of tasks) {
    if (t.status !== 2) continue;
    if (!t.completedTime) continue;
    const ms = new Date(t.completedTime).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms < range.startMs || ms >= range.endMs) continue;

    const cat = (t.projectId && projectIdToCategory.get(t.projectId)) || 'uncategorized';
    byCategory[cat] += 1;
    total += 1;
  }
  return { total, byCategory };
}

/**
 * Focus minutes broken down by the list of the task each session was spent on.
 * `total` is computed by the untouched whole-day formula and then apportioned, so it is
 * always bit-identical to `sumFocusMinutesToday` and the parts always sum back to it.
 */
export function sumFocusMinutesByCategory(
  pomodoros: TickTickPomodoro[],
  range: LocalDayRange
): CategorizedTotal {
  const secondsByCategory = new Map<Category, number>();
  let totalSeconds = 0;

  for (const p of pomodoros) {
    const seconds = sessionSecondsInRange(p, range);
    if (seconds === null) continue;
    totalSeconds += seconds;
    splitSessionSeconds(p, seconds, secondsByCategory);
  }

  const weights = emptyCategoryTotals();
  for (const [cat, secs] of secondsByCategory) weights[cat] = secs;

  const total = Math.round(totalSeconds / 60);
  return { total, byCategory: apportion(total, weights) };
}
