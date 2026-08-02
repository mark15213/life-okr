import { NextRequest, NextResponse } from 'next/server';
import { hasValidAuthSession } from '@/lib/auth';
import { completeTask } from '@/lib/ticktick/client';
import { tickTickErrorResponse } from '@/lib/ticktick/http';
import { resolveTickTickCookie } from '@/lib/ticktick/session';

export const dynamic = 'force-dynamic';

/**
 * Tick a task off.
 *
 * Nothing is written to the dashboard database here. The completion goes to TickTick only,
 * and comes back through the existing sync — writing both would count the task twice, once
 * in `tasks_completed` and once in `tasks_completed_ticktick`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'A task id is required' }, { status: 400 });
  }

  try {
    const task = await completeTask(await resolveTickTickCookie(), id, new Date());
    return NextResponse.json({ completed: { id: task.id, title: task.title ?? '' } });
  } catch (error) {
    return tickTickErrorResponse(error);
  }
}
