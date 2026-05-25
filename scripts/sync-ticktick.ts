import dotenv from 'dotenv';
import path from 'node:path';
import { OfficialClient, UnofficialClient } from './lib/ticktick-client';
import { upsertTicktickSync } from '../lib/db';

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
  const official = new OfficialClient({
    clientId: requireEnv('TICKTICK_CLIENT_ID'),
    clientSecret: requireEnv('TICKTICK_CLIENT_SECRET'),
    accessToken: requireEnv('TICKTICK_ACCESS_TOKEN'),
    // TickTick's open OAuth does not return a refresh_token. Access tokens last
    // ~180 days; when they expire, re-run scripts/ticktick-oauth-bootstrap.ts.
    refreshToken: process.env.TICKTICK_REFRESH_TOKEN ?? '',
  });
  const unofficial = new UnofficialClient({
    email: requireEnv('TICKTICK_EMAIL'),
    password: requireEnv('TICKTICK_PASSWORD'),
    sessionCachePath: path.resolve(process.cwd(), '.ticktick-session.json'),
  });

  const [tasksCompleted, focusMinutes] = await Promise.all([
    official.getCompletedTaskCountToday(),
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
    process.exit(1);
  });
