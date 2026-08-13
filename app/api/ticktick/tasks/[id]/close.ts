import { NextRequest, NextResponse } from 'next/server';
import { hasValidAuthSession } from '@/lib/auth';
import { closeTask } from '@/lib/ticktick/client';
import { tickTickErrorResponse } from '@/lib/ticktick/http';
import { type TaskOutcome } from '@/lib/ticktick/payloads';
import { resolveTickTickCookie } from '@/lib/ticktick/session';

/**
 * The body behind both `POST .../complete` and `POST .../wont-do`.
 *
 * Two routes rather than one route with an outcome in the body: the outcome is not a
 * parameter of the request so much as which request it is, and a mistyped body field would
 * otherwise silently fall back to whichever outcome the default happened to be — the one
 * mistake here that quietly rewrites history, since only `status === 2` scores as work done.
 *
 * Nothing is written to the dashboard database either way. The change goes to TickTick only
 * and comes back through the existing sync — writing both would count the task twice, once
 * in `tasks_completed` and once in `tasks_completed_ticktick`.
 */
export async function closeTaskRoute(
  request: NextRequest,
  params: Promise<{ id: string }>,
  outcome: TaskOutcome
): Promise<NextResponse> {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'A task id is required' }, { status: 400 });
  }

  try {
    const task = await closeTask(await resolveTickTickCookie(), id, outcome, new Date());
    return NextResponse.json({ closed: { id: task.id, title: task.title ?? '', outcome } });
  } catch (error) {
    return tickTickErrorResponse(error);
  }
}
