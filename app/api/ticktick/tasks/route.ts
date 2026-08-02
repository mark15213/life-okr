import { NextRequest, NextResponse } from 'next/server';
import { hasValidAuthSession } from '@/lib/auth';
import { createTask, fetchSnapshot } from '@/lib/ticktick/client';
import { tickTickErrorResponse } from '@/lib/ticktick/http';
import { CAPTURE_LIST_KEYS, type TaskListKey } from '@/lib/ticktick/lists';
import { buildNewTaskPayload, newObjectId } from '@/lib/ticktick/payloads';
import { resolveTickTickCookie } from '@/lib/ticktick/session';
import { APP_TZ, sortPanelTasks, toPanelTask } from '@/lib/ticktick/tasks';

export const dynamic = 'force-dynamic';

function isCaptureList(value: unknown): value is TaskListKey {
  return typeof value === 'string' && (CAPTURE_LIST_KEYS as readonly string[]).includes(value);
}

/**
 * Every route here is gated, reads included: the TickTick cookie is a full-account credential,
 * so an unauthenticated GET would leak the entire task list to anyone who loads the dashboard.
 */
export async function GET(request: NextRequest) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await fetchSnapshot(await resolveTickTickCookie());
    const now = new Date();
    const tasks = sortPanelTasks(
      snapshot.openTasks.map((task) => toPanelTask(task, snapshot.listKeyByProjectId, now))
    );
    return NextResponse.json({ tasks });
  } catch (error) {
    return tickTickErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { title?: unknown; list?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'A task title is required' }, { status: 400 });
  }
  if (!isCaptureList(body.list)) {
    return NextResponse.json(
      { error: `list must be one of ${CAPTURE_LIST_KEYS.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const cookie = await resolveTickTickCookie();
    const snapshot = await fetchSnapshot(cookie);
    const projectId = snapshot.projectIdByListKey.get(body.list);
    if (!projectId) {
      return NextResponse.json(
        { error: `No TickTick list named "${body.list}" was found on this account` },
        { status: 409 }
      );
    }

    const now = new Date();
    const id = newObjectId();
    const payload = buildNewTaskPayload({
      id,
      title,
      projectId,
      due: now,
      timeZone: APP_TZ,
    });

    await createTask(cookie, payload);

    // Echo the task back in panel shape so the optimistic row can be replaced with the real
    // one immediately, without waiting for a re-fetch that costs another full account sync.
    const task = toPanelTask(
      { id, title, projectId, priority: 5, status: 0, isAllDay: false, dueDate: payload.dueDate as string },
      snapshot.listKeyByProjectId,
      now
    );

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return tickTickErrorResponse(error);
  }
}
