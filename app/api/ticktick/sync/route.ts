import { NextRequest, NextResponse } from 'next/server';
import { hasValidAuthSession } from '@/lib/auth';
import { upsertTicktickSync } from '@/lib/db';
import { tickTickErrorResponse } from '@/lib/ticktick/http';
import { resolveTickTickCookie } from '@/lib/ticktick/session';
import { APP_TZ, syncWindow } from '@/lib/ticktick/sync';

export const dynamic = 'force-dynamic';

/**
 * Two days by default. A pomodoro that runs across midnight belongs to the day it started
 * on, so finishing one at 00:15 has to be able to update yesterday's row.
 */
const DEFAULT_DAYS = 2;
const MAX_DAYS = 7;

/**
 * Recompute the recent days from TickTick and store the result.
 *
 * This exists because the laptop cron is not a dependable courier: it only runs on one
 * machine, on a 15-minute timer, and only while that machine is awake with working DNS.
 * Focus started from the web needs to reach the dashboard without waiting on any of that.
 *
 * Calling this repeatedly is harmless, and that is the design rather than a happy accident.
 * It never adds anything — it recomputes each day's total from TickTick and overwrites the
 * stored value, so running it twice, or from two machines at once, lands on the same number
 * the laptop's cron would have written. An endpoint that added a delta could double-count;
 * this one cannot.
 */
export async function POST(request: NextRequest) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let days = DEFAULT_DAYS;
  try {
    const body = await request.json();
    if (typeof body?.days === 'number' && Number.isFinite(body.days)) {
      days = Math.min(MAX_DAYS, Math.max(1, Math.floor(body.days)));
    }
  } catch {
    // No body is the normal case; the default window stands.
  }

  try {
    const result = await syncWindow({
      cookie: await resolveTickTickCookie(),
      dayCount: days,
      timeZone: APP_TZ,
      upsert: upsertTicktickSync,
    });

    return NextResponse.json({
      synced: result.writes.map((w) => ({
        date: w.date,
        focusMinutes: w.focusMinutes,
        tasksCompleted: w.tasksCompleted,
      })),
      skipped: result.skipped,
    });
  } catch (error) {
    return tickTickErrorResponse(error);
  }
}
