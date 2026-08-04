import dotenv from 'dotenv';
import path from 'node:path';

// dotenv must run before lib/db is imported — lib/db initializes the postgres
// client at module load using process.env.POSTGRES_URL.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const { upsertTicktickSync } = await import('../lib/db');
  const { syncWindow, APP_TZ } = await import('../lib/ticktick/sync');
  const { resolveTickTickCookie } = await import('../lib/ticktick/session');

  // The sync body lives in lib/ticktick/sync.ts because the web app runs the very same
  // recompute after a focus session is uploaded. One implementation is the point: the write
  // is absolute rather than incremental, so whichever machine runs last just restates the
  // same number — but only as long as both derive it identically, down to where a day starts.
  const result = await syncWindow({
    cookie: await resolveTickTickCookie(),
    // Small by default: the timeline endpoint only reaches back so far, and re-syncing a
    // trailing window is what lets a later run repair a day the laptop slept through.
    dayCount: Number(process.env.TICKTICK_SYNC_DAYS ?? 3),
    timeZone: APP_TZ,
    upsert: upsertTicktickSync,
    onLog: (message) => console.warn(`⚠️  ${message}`),
  });

  for (const date of result.skipped) {
    console.log(`↷ ticktick sync ${date}: nothing reported, leaving stored value untouched`);
  }

  for (const write of result.writes) {
    const breakdown = Object.entries(write.byCategory)
      .filter(([, v]) => v.focusMinutes > 0 || v.tasksCompleted > 0)
      .map(([c, v]) => `${c}=${v.focusMinutes}m/${v.tasksCompleted}t`)
      .join(' ');
    console.log(
      `✅ ticktick sync ${write.date}: focus=${write.focusMinutes}m, tasks=${write.tasksCompleted}`
    );
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
