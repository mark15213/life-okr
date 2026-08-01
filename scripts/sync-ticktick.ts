import dotenv from 'dotenv';
import path from 'node:path';
import { UnofficialClient } from './lib/ticktick-client';
import { CATEGORIES, type Category } from './lib/ticktick-aggregate';
import { getLocalDateString, recentLocalDays } from './lib/ticktick-date';

// dotenv must run before lib/db is imported — lib/db initializes the postgres
// client at module load using process.env.POSTGRES_URL.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`❌ Missing env: ${key} (set in .env.local)`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const { upsertTicktickSync } = await import('../lib/db');

  // Both task count and focus minutes go through the unofficial cookie API — the
  // official /open/v1 endpoint excludes Inbox tasks, so it was unusable for users
  // who keep most tasks in Inbox. See memory/ticktick-api-quirks.md.
  const unofficial = new UnofficialClient({
    email: requireEnv('TICKTICK_EMAIL'),
    password: requireEnv('TICKTICK_PASSWORD'),
    sessionCachePath: path.resolve(process.cwd(), '.ticktick-session.json'),
  });

  // Fetched first and awaited, not folded into the Promise.all below, for two reasons:
  // it warms the session cookie (ensureSession is not concurrency-safe, so parallel cold
  // calls would each run login()), and a failure here must not stop the totals from being
  // written — we degrade to "everything uncategorized" instead.
  let projectMap = new Map<string, Category>();
  try {
    projectMap = await unofficial.getProjectMap();
  } catch (e) {
    console.warn('⚠️  could not load TickTick lists, categorizing everything as uncategorized:',
      e instanceof Error ? e.message : e);
  }

  // Re-sync a trailing window, not just today. This job runs off a laptop that sleeps: on
  // 2026-07-31 the machine slept from 02:10, the last run of that day had already recorded
  // focus=0, and the four sessions logged from 10:00 onward were lost for good because the
  // next run stamped a new date and never revisited. Any successful run now repairs the
  // recent past. Window is small by default — the timeline endpoint only reaches back so far.
  const days = recentLocalDays(Number(process.env.TICKTICK_SYNC_DAYS ?? 3), new Date());
  const today = getLocalDateString(new Date());

  const [tasksByDay, focusByDay] = await Promise.all([
    unofficial.getCompletedTaskCountsByDay(days, projectMap),
    unofficial.getFocusMinutesByDay(days),
  ]);

  for (const { date } of days) {
    const focus = focusByDay.get(date)!;
    const tasks = tasksByDay.get(date)!;
    const isToday = date === today;

    // Today is always written, so deleting a session in TickTick still shows up. A *past*
    // day reporting all-zero is ambiguous — genuinely empty, or the API window no longer
    // reaches it — and overwriting would wipe real history, which has bitten this sync
    // before. Filling a gap is safe; zeroing a settled day is not, so we skip it.
    if (!isToday && focus.total === 0 && tasks.total === 0) {
      console.log(`↷ ticktick sync ${date}: nothing reported, leaving stored value untouched`);
      continue;
    }

    const byCategory = Object.fromEntries(
      CATEGORIES.map((c) => [c, {
        focusMinutes: focus.byCategory[c],
        tasksCompleted: tasks.byCategory[c],
      }])
    ) as Record<Category, { focusMinutes: number; tasksCompleted: number }>;

    await upsertTicktickSync(date, focus.total, tasks.total, byCategory);

    const breakdown = CATEGORIES
      .filter((c) => byCategory[c].focusMinutes > 0 || byCategory[c].tasksCompleted > 0)
      .map((c) => `${c}=${byCategory[c].focusMinutes}m/${byCategory[c].tasksCompleted}t`)
      .join(' ');
    console.log(`✅ ticktick sync ${date}: focus=${focus.total}m, tasks=${tasks.total}`);
    console.log(`   by category: ${breakdown || '(none)'}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ ticktick sync failed:', e instanceof Error ? e.message : e);
    if (e instanceof Error && e.cause) {
      console.error('   cause:', e.cause);
    }
    process.exit(1);
  });
