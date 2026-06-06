import dotenv from 'dotenv';
import path from 'node:path';
import { UnofficialClient } from './lib/ticktick-client';
import { getLocalDateString } from './lib/ticktick-date';
import {
  sumFocusMinutesToday,
  countCompletedTasksToday,
  type TickTickPomodoro,
  type TickTickTask,
} from './lib/ticktick-aggregate';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`❌ Missing env: ${key} (set in .env.local)`);
    process.exit(1);
  }
  return v;
}

function parseArgs(argv: string[]): { days: number; dryRun: boolean } {
  let days = 14;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) days = n;
    } else if (a === '--dry-run') {
      dryRun = true;
    }
  }
  return { days, dryRun };
}

function fmtLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function localDayStart(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 0, 0, 0, 0);
}

async function fetchAllPomodorosSince(client: UnofficialClient, cutoffMs: number): Promise<TickTickPomodoro[]> {
  const c = client as unknown as { ensureSession: () => Promise<void>; authedGet: <T>(u: string) => Promise<T> };
  await c.ensureSession();

  const all: TickTickPomodoro[] = [];
  let to = Date.now();
  // Paginate by walking `to` backwards using the oldest seen endTime.
  for (let page = 0; page < 20; page++) {
    const url = `https://api.ticktick.com/api/v2/pomodoros/timeline?to=${to}`;
    const batch = (await c.authedGet<TickTickPomodoro[] | null>(url)) ?? [];
    if (batch.length === 0) break;
    all.push(...batch);
    let oldestMs = Infinity;
    for (const p of batch) {
      const ms = new Date(p.endTime).getTime();
      if (Number.isFinite(ms) && ms < oldestMs) oldestMs = ms;
    }
    if (!Number.isFinite(oldestMs) || oldestMs <= cutoffMs) break;
    if (oldestMs >= to) break; // safety: pagination not advancing
    to = oldestMs - 1;
  }
  return all;
}

async function fetchTasksInRange(client: UnofficialClient, start: Date, end: Date): Promise<TickTickTask[]> {
  const c = client as unknown as { ensureSession: () => Promise<void>; authedGet: <T>(u: string) => Promise<T> };
  await c.ensureSession();
  const url = `https://api.ticktick.com/api/v2/project/all/completed/?from=${encodeURIComponent(fmtLocal(start))}&to=${encodeURIComponent(fmtLocal(end))}&limit=500`;
  return (await c.authedGet<TickTickTask[] | null>(url)) ?? [];
}

async function main() {
  const { days, dryRun } = parseArgs(process.argv.slice(2));
  const { upsertTicktickSync } = await import('../lib/db');

  const client = new UnofficialClient({
    email: requireEnv('TICKTICK_EMAIL'),
    password: requireEnv('TICKTICK_PASSWORD'),
    sessionCachePath: path.resolve(process.cwd(), '.ticktick-session.json'),
  });

  const now = new Date();
  const todayStart = localDayStart(now.getFullYear(), now.getMonth(), now.getDate());
  const oldestDayStart = new Date(todayStart);
  oldestDayStart.setDate(oldestDayStart.getDate() - (days - 1));
  const rangeEnd = new Date(todayStart);
  rangeEnd.setDate(rangeEnd.getDate() + 1); // end-of-today exclusive midnight

  console.log(`backfill window: ${getLocalDateString(oldestDayStart)} → ${getLocalDateString(todayStart)} (${days} days), dryRun=${dryRun}`);

  const [pomodoros, tasks] = await Promise.all([
    fetchAllPomodorosSince(client, oldestDayStart.getTime()),
    fetchTasksInRange(client, oldestDayStart, new Date(rangeEnd.getTime() - 1)),
  ]);
  console.log(`fetched: pomodoros=${pomodoros.length}, completed tasks=${tasks.length}`);

  // Iterate days oldest → newest, aggregate, upsert.
  let touched = 0;
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(todayStart);
    dayStart.setDate(dayStart.getDate() - i);
    const range = { startMs: dayStart.getTime(), endMs: dayStart.getTime() + 86_400_000 };

    const focusMin = sumFocusMinutesToday(pomodoros, range);
    const taskCount = countCompletedTasksToday(tasks, range);
    const dateStr = getLocalDateString(dayStart);

    console.log(`  ${dateStr}: focus=${focusMin}m, tasks=${taskCount}`);
    if (!dryRun) {
      await upsertTicktickSync(dateStr, focusMin, taskCount);
      touched++;
    }
  }

  if (dryRun) {
    console.log('dry-run complete — no rows written');
  } else {
    console.log(`✅ upserted ${touched} day(s)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ backfill failed:', e instanceof Error ? e.message : e);
    if (e instanceof Error && e.cause) console.error('   cause:', e.cause);
    process.exit(1);
  });
