import { NextRequest, NextResponse } from 'next/server';
import { hasValidAuthSession } from '@/lib/auth';
import {
  isAppStateKey,
  parseFocusSession,
  parseQueueOrder,
  readAppState,
  writeAppState,
  type AppStateKey,
} from '@/lib/app-state';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/state/queue-order    → { value: { order: [...] } | null, version, updatedAt }
 * GET  /api/state/focus-session  → { value: FocusSession | null,   version, updatedAt }
 * PUT  same paths, body { value, ifVersion? } → the stored row, or 409 when ifVersion is stale.
 *
 * Gated in both directions: the queue mirrors TickTick task ids and the session names tasks,
 * so reads leak the same thing the tasks route protects.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { key } = await params;
  if (!isAppStateKey(key)) return NextResponse.json({ error: 'Unknown state key' }, { status: 404 });

  try {
    const stored = await readAppState(key);
    return NextResponse.json(stored ?? { value: null, version: 0, updatedAt: null });
  } catch (error) {
    console.error(`Error reading app state ${key}:`, error);
    return NextResponse.json({ error: 'Failed to read state' }, { status: 500 });
  }
}

function validate(key: AppStateKey, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (key === 'queue-order') {
    const parsed = parseQueueOrder(value);
    return parsed ? { ok: true, value: parsed } : { ok: false, error: 'order must be an array of unique task ids' };
  }
  const parsed = parseFocusSession(value);
  return parsed.ok ? { ok: true, value: parsed.value } : parsed;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!hasValidAuthSession(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { key } = await params;
  if (!isAppStateKey(key)) return NextResponse.json({ error: 'Unknown state key' }, { status: 404 });

  let body: { value?: unknown; ifVersion?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!('value' in body)) return NextResponse.json({ error: 'A value is required' }, { status: 400 });

  const ifVersion = body.ifVersion;
  if (ifVersion !== undefined && (typeof ifVersion !== 'number' || !Number.isInteger(ifVersion) || ifVersion < 0)) {
    return NextResponse.json({ error: 'ifVersion must be a non-negative integer' }, { status: 400 });
  }

  const checked = validate(key, body.value);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  try {
    const stored = await writeAppState(key, checked.value, ifVersion as number | undefined);
    if (!stored) {
      const current = await readAppState(key);
      return NextResponse.json({ error: 'State changed on another device', current }, { status: 409 });
    }
    return NextResponse.json(stored);
  } catch (error) {
    console.error(`Error writing app state ${key}:`, error);
    return NextResponse.json({ error: 'Failed to write state' }, { status: 500 });
  }
}
