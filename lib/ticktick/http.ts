import { NextResponse } from 'next/server';
import { TickTickNotConfiguredError } from './session';
import { TaskNotFoundError, TickTickAuthError } from './client';

/**
 * Turn a TickTick failure into a response the panel can show verbatim. These are the two
 * failures that are actually actionable — a missing cookie and an expired one look identical
 * from the UI otherwise, and both need a different fix.
 */
export function tickTickErrorResponse(error: unknown): NextResponse {
  if (error instanceof TickTickNotConfiguredError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof TickTickAuthError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  if (error instanceof TaskNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  console.error('TickTick request failed:', error);
  return NextResponse.json({ error: 'TickTick request failed' }, { status: 502 });
}
