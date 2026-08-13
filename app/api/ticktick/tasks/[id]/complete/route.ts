import { NextRequest } from 'next/server';
import { closeTaskRoute } from '../close';

export const dynamic = 'force-dynamic';

/** Tick a task off. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return closeTaskRoute(request, params, 'complete');
}
