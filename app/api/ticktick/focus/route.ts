import { NextRequest, NextResponse } from 'next/server';
import { hasValidAuthSession } from '@/lib/auth';
import { fetchSnapshot, postFocusSession } from '@/lib/ticktick/client';
import { tickTickErrorResponse } from '@/lib/ticktick/http';
import { buildFocusSessionPayload } from '@/lib/ticktick/payloads';
import { MIN_LOGGED_FOCUS_SECONDS } from '@/lib/ticktick/pomodoro';
import { resolveTickTickCookie } from '@/lib/ticktick/session';

export const dynamic = 'force-dynamic';

const SESSION_ID = /^[0-9a-f]{24}$/;

/** A day is well past any plausible pomodoro, and bounds what a bad clock can write. */
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Upload one finished pomodoro.
 *
 * The timer runs in the browser — TickTick has no remote-start — so the client reports the
 * span it measured. Everything it reports is re-checked here, and the session's *category*
 * is resolved server-side rather than trusted: focus sessions are filed by list name, and
 * that name is what the sync buckets minutes by.
 *
 * The session id comes from the client and is reused across retries, so re-posting after a
 * dropped connection updates the same session instead of double-counting the focus.
 */
export async function POST(request: NextRequest) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!SESSION_ID.test(sessionId)) {
    return NextResponse.json({ error: 'sessionId must be a 24-character hex id' }, { status: 400 });
  }

  const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
  if (!taskId) {
    return NextResponse.json({ error: 'A taskId is required' }, { status: 400 });
  }

  const startedAt = finiteNumber(body.startedAt);
  const endedAt = finiteNumber(body.endedAt);
  const pausedSeconds = finiteNumber(body.pausedSeconds) ?? 0;

  if (startedAt === null || endedAt === null || endedAt <= startedAt) {
    return NextResponse.json(
      { error: 'startedAt and endedAt must be epoch milliseconds, and endedAt must be later' },
      { status: 400 }
    );
  }
  if (endedAt - startedAt > MAX_SESSION_MS) {
    return NextResponse.json({ error: 'That session is implausibly long' }, { status: 400 });
  }
  if (pausedSeconds < 0) {
    return NextResponse.json({ error: 'pausedSeconds cannot be negative' }, { status: 400 });
  }

  const focusSeconds = Math.round((endedAt - startedAt) / 1000) - Math.round(pausedSeconds);
  if (focusSeconds < MIN_LOGGED_FOCUS_SECONDS) {
    return NextResponse.json(
      { error: `A session shorter than ${MIN_LOGGED_FOCUS_SECONDS}s is not recorded` },
      { status: 400 }
    );
  }

  try {
    const cookie = await resolveTickTickCookie();
    const snapshot = await fetchSnapshot(cookie);
    const task = snapshot.openTasks.find((candidate) => candidate.id === taskId);

    // A task finished in another client mid-session is still worth the focus record, so the
    // upload falls back to the title the panel was showing rather than failing outright.
    const fallbackTitle = typeof body.title === 'string' ? body.title.trim() : '';
    const title = (task?.title ?? '').trim() || fallbackTitle;
    const projectName = task?.projectId ? snapshot.projectNameById.get(task.projectId) ?? null : null;

    await postFocusSession(
      cookie,
      buildFocusSessionPayload({
        id: sessionId,
        taskId,
        title,
        projectName,
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
        pausedSeconds,
      })
    );

    return NextResponse.json({ focusSeconds }, { status: 201 });
  } catch (error) {
    return tickTickErrorResponse(error);
  }
}
