import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getTokenUsage, upsertTokenUsage, TokenUsageRow } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_ENTRIES = 60;
const MAX_DAYS = 365;
const ALLOWED_TOOLS = new Set(['claude_code', 'codex']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bearerValid(req: NextRequest): boolean {
  const expected = process.env.TOKEN_REPORT_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  const provided = m[1];
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!bearerValid(request)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const entries = (body as { entries?: unknown })?.entries;
  if (!Array.isArray(entries)) {
    return NextResponse.json({ error: 'entries must be an array' }, { status: 400 });
  }
  if (entries.length === 0) {
    return NextResponse.json({ updated: 0 });
  }
  if (entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: `entries length must be <= ${MAX_ENTRIES}` }, { status: 400 });
  }

  const validated: Array<{ date: string; tool: 'claude_code' | 'codex'; total_tokens: number }> = [];
  for (const e of entries) {
    if (typeof e !== 'object' || e === null) {
      return NextResponse.json({ error: 'entry must be an object' }, { status: 400 });
    }
    const date = (e as Record<string, unknown>).date;
    const tool = (e as Record<string, unknown>).tool;
    const total_tokens = (e as Record<string, unknown>).total_tokens;
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    }
    if (typeof tool !== 'string' || !ALLOWED_TOOLS.has(tool)) {
      return NextResponse.json({ error: 'invalid tool' }, { status: 400 });
    }
    if (typeof total_tokens !== 'number' || !Number.isFinite(total_tokens) || total_tokens < 0 || !Number.isInteger(total_tokens)) {
      return NextResponse.json({ error: 'invalid total_tokens' }, { status: 400 });
    }
    validated.push({ date, tool: tool as 'claude_code' | 'codex', total_tokens });
  }

  try {
    const updated = await upsertTokenUsage(validated);
    return NextResponse.json({ updated });
  } catch (error) {
    console.error('Error in POST /api/tokens:', error);
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const daysParam = request.nextUrl.searchParams.get('days') ?? '30';
    const days = parseInt(daysParam, 10);
    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json({ error: 'invalid days parameter' }, { status: 400 });
    }
    if (days > MAX_DAYS) {
      return NextResponse.json({ error: `days must not exceed ${MAX_DAYS}` }, { status: 400 });
    }
    const rows: TokenUsageRow[] = await getTokenUsage(days);
    return NextResponse.json({ entries: rows });
  } catch (error) {
    console.error('Error in GET /api/tokens:', error);
    return NextResponse.json({ error: 'failed to fetch token usage' }, { status: 500 });
  }
}
