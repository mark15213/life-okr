import dotenv from 'dotenv';
import path from 'node:path';
import { UnofficialClient } from './lib/ticktick-client';

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

  const [tasksCompleted, focusMinutes] = await Promise.all([
    unofficial.getCompletedTaskCountToday(),
    unofficial.getFocusMinutesToday(),
  ]);

  const today = new Date().toISOString().split('T')[0];
  await upsertTicktickSync(today, focusMinutes, tasksCompleted);
  console.log(`✅ ticktick sync ${today}: focus=${focusMinutes}m, tasks=${tasksCompleted}`);
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
