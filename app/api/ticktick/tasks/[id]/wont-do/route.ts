import { NextRequest } from 'next/server';
import { closeTaskRoute } from '../close';

export const dynamic = 'force-dynamic';

/**
 * Drop a task without doing it. TickTick calls this "Won't Do" and files it as `status: -1`
 * ("Abandoned"), so it leaves the open list without ever counting as a completed task.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return closeTaskRoute(request, params, 'wont-do');
}
