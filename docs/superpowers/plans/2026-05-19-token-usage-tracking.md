# Token Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add daily AI token usage (Claude Code + Codex CLI) to the life dashboard as a productivity-proxy metric, populated by a local launchd scraper that POSTs to a new `/api/tokens` endpoint.

**Architecture:** Three independent pieces — a local TS scraper (`scripts/report-tokens.ts`) that scans `~/.claude/projects/*.jsonl` and `~/.codex/sessions/*.jsonl`, a new Next.js API route (`/api/tokens`) backed by a `token_usage` Postgres table, and a `TokenCard` UI on the home dashboard plus a new series on the analytics chart.

**Tech Stack:** Next.js 16 (App Router), TypeScript, postgres-js, SWR, recharts, framer-motion, tsx, Node's built-in `node:test`, launchd.

**Spec:** `docs/superpowers/specs/2026-05-19-token-usage-tracking-design.md`

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `scripts/lib/token-parsers.ts` | Pure functions: `localDateOf`, `parseClaudeLine`, `parseCodexLine`. No I/O. |
| `scripts/lib/token-parsers.test.ts` | `node:test` unit tests for the pure functions. |
| `scripts/report-tokens.ts` | I/O orchestrator: `scanClaude`, `scanCodex`, chunked POST, summary log. |
| `scripts/migrate-add-token-usage.ts` | One-off DB migration to create `token_usage` on the existing prod DB. |
| `scripts/com.life-okr.token-reporter.plist.template` | launchd plist template with `__SCRIPT__`/`__LOG__`/`__NODE_BIN__` placeholders. |
| `scripts/install-token-reporter.sh` | Substitutes placeholders, writes plist to `~/Library/LaunchAgents/`, runs `launchctl bootstrap`. |
| `app/api/tokens/route.ts` | `GET` (read) + `POST` (write, bearer-auth) endpoint. |
| `components/TokenCard.tsx` | Dashboard card matching `FocusCard.tsx` style. |

### Files to modify

| Path | Change |
|---|---|
| `scripts/init-db.sql` | Add `CREATE TABLE token_usage` + index. |
| `lib/db.ts` | Add `TokenUsageRow` type, `getTokenUsage`, `upsertTokenUsage`. |
| `app/page.tsx` | Add SWR fetch for `/api/tokens`, mount `TokenCard`, change grid to `md:grid-cols-2 lg:grid-cols-4`. |
| `components/DashboardAnalytics.tsx` | Add `tokens` to `METRICS_CONFIG` + `METRIC_KEYS`; widen `records` prop type. |
| `app/analytics/page.tsx` | Fetch `/api/tokens`, merge `total_tokens` into records by date. |
| `.env.example` | Add `TOKEN_REPORT_SECRET=`, `DASHBOARD_URL=http://localhost:3000`. |
| `package.json` | Add `"report-tokens": "tsx scripts/report-tokens.ts"`. |

---

## Task 1: `localDateOf` (TDD)

**Files:**
- Create: `scripts/lib/token-parsers.ts`
- Create: `scripts/lib/token-parsers.test.ts`

This task also establishes the `node:test` pattern used by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/token-parsers.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { localDateOf } from './token-parsers';

test('localDateOf returns YYYY-MM-DD in process timezone', () => {
  // Use a UTC timestamp known to land on different dates depending on TZ.
  // 2026-05-19T03:00:00Z is May 18 in US Pacific, May 19 in UTC/Asia.
  const out = localDateOf('2026-05-19T03:00:00Z');
  assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
  // Reconstruct the expected local date from the same Date object the impl uses
  const d = new Date('2026-05-19T03:00:00Z');
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(out, expected);
});

test('localDateOf zero-pads month and day', () => {
  const out = localDateOf('2026-01-02T12:00:00Z');
  assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
});

test('localDateOf returns null-equivalent on invalid input', () => {
  // We choose to throw on bad input rather than return null — caller must filter timestamps first.
  assert.throws(() => localDateOf('not-a-date'));
});
```

Create empty `scripts/lib/token-parsers.ts`:

```ts
export function localDateOf(_isoUtc: string): string {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/lib/token-parsers.test.ts`
Expected: tests fail with "not implemented".

- [ ] **Step 3: Implement `localDateOf`**

Replace the body in `scripts/lib/token-parsers.ts`:

```ts
export function localDateOf(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`localDateOf: invalid timestamp ${isoUtc}`);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/lib/token-parsers.test.ts`
Expected: 3 tests pass, process exits 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/token-parsers.ts scripts/lib/token-parsers.test.ts
git commit -m "feat(scraper): add localDateOf pure helper"
```

---

## Task 2: `parseClaudeLine` (TDD)

**Files:**
- Modify: `scripts/lib/token-parsers.ts` (add export)
- Modify: `scripts/lib/token-parsers.test.ts` (add tests)

Each `~/.claude/projects/<encoded-path>/<session>.jsonl` line that represents an assistant turn has `type === "assistant"`, an ISO `timestamp`, and `message.usage` with four token fields. Sum them.

- [ ] **Step 1: Append the failing tests**

Append to `scripts/lib/token-parsers.test.ts`:

```ts
import { parseClaudeLine } from './token-parsers';

const CLAUDE_LINE_VALID = JSON.stringify({
  timestamp: '2026-05-19T15:30:00Z',
  type: 'assistant',
  message: {
    role: 'assistant',
    usage: {
      input_tokens: 6,
      output_tokens: 113,
      cache_creation_input_tokens: 13154,
      cache_read_input_tokens: 16760,
    },
  },
});

test('parseClaudeLine sums all four token fields', () => {
  const out = parseClaudeLine(CLAUDE_LINE_VALID);
  assert.ok(out);
  assert.equal(out!.tokens, 6 + 113 + 13154 + 16760);
});

test('parseClaudeLine attaches local date from timestamp', () => {
  const out = parseClaudeLine(CLAUDE_LINE_VALID);
  assert.ok(out);
  assert.match(out!.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseClaudeLine returns null for user messages (no usage)', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'user',
    message: { role: 'user', content: 'hi' },
  });
  assert.equal(parseClaudeLine(line), null);
});

test('parseClaudeLine returns null for malformed JSON', () => {
  assert.equal(parseClaudeLine('not json'), null);
});

test('parseClaudeLine returns null for empty/whitespace lines', () => {
  assert.equal(parseClaudeLine(''), null);
  assert.equal(parseClaudeLine('   \n'), null);
});

test('parseClaudeLine treats missing token fields as zero', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'assistant',
    message: { role: 'assistant', usage: { input_tokens: 5, output_tokens: 10 } },
  });
  const out = parseClaudeLine(line);
  assert.ok(out);
  assert.equal(out!.tokens, 15);
});

test('parseClaudeLine returns null when computed total is zero', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'assistant',
    message: { role: 'assistant', usage: { input_tokens: 0, output_tokens: 0 } },
  });
  assert.equal(parseClaudeLine(line), null);
});
```

Append a stub to `scripts/lib/token-parsers.ts`:

```ts
export interface ParsedTokens {
  date: string;
  tokens: number;
}

export function parseClaudeLine(_line: string): ParsedTokens | null {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx tsx scripts/lib/token-parsers.test.ts`
Expected: the 7 new `parseClaudeLine` tests fail; previous 3 tests still pass.

- [ ] **Step 3: Implement `parseClaudeLine`**

Replace the stub in `scripts/lib/token-parsers.ts`:

```ts
export function parseClaudeLine(line: string): ParsedTokens | null {
  if (!line.trim()) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const ts = o.timestamp;
  const message = o.message as Record<string, unknown> | undefined;
  const usage = message?.usage as Record<string, unknown> | undefined;
  if (typeof ts !== 'string' || !usage) return null;
  const tokens =
    asInt(usage.input_tokens) +
    asInt(usage.output_tokens) +
    asInt(usage.cache_creation_input_tokens) +
    asInt(usage.cache_read_input_tokens);
  if (tokens <= 0) return null;
  return { date: localDateOf(ts), tokens };
}

function asInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx scripts/lib/token-parsers.test.ts`
Expected: 10 tests pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/token-parsers.ts scripts/lib/token-parsers.test.ts
git commit -m "feat(scraper): add parseClaudeLine"
```

---

## Task 3: `parseCodexLine` (TDD)

**Files:**
- Modify: `scripts/lib/token-parsers.ts`
- Modify: `scripts/lib/token-parsers.test.ts`

Each `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` token-bearing line has shape `{timestamp, type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { total_tokens } } }}`. The per-turn delta is `payload.info.last_token_usage.total_tokens` — **not** `total_token_usage.total_tokens` (which is the cumulative session total).

- [ ] **Step 1: Append the failing tests**

Append to `scripts/lib/token-parsers.test.ts`:

```ts
import { parseCodexLine } from './token-parsers';

const CODEX_LINE_VALID = JSON.stringify({
  timestamp: '2026-05-19T15:30:00Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: { total_tokens: 999999 }, // cumulative — must be IGNORED
      last_token_usage: {
        input_tokens: 100,
        cached_input_tokens: 50,
        output_tokens: 200,
        reasoning_output_tokens: 0,
        total_tokens: 350,
      },
      model_context_window: null,
    },
    rate_limits: null,
  },
});

test('parseCodexLine reads last_token_usage.total_tokens (delta), not cumulative', () => {
  const out = parseCodexLine(CODEX_LINE_VALID);
  assert.ok(out);
  assert.equal(out!.tokens, 350);
});

test('parseCodexLine attaches local date from line timestamp', () => {
  const out = parseCodexLine(CODEX_LINE_VALID);
  assert.ok(out);
  assert.match(out!.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseCodexLine returns null for session_meta lines', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'session_meta',
    payload: { id: 'abc', cli_version: '0.131.0' },
  });
  assert.equal(parseCodexLine(line), null);
});

test('parseCodexLine returns null for event_msg lines that are not token_count', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'event_msg',
    payload: { type: 'agent_message_delta', text: 'hi' },
  });
  assert.equal(parseCodexLine(line), null);
});

test('parseCodexLine returns null when last_token_usage.total_tokens is missing or zero', () => {
  const line = JSON.stringify({
    timestamp: '2026-05-19T15:30:00Z',
    type: 'event_msg',
    payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 0 } } },
  });
  assert.equal(parseCodexLine(line), null);
});

test('parseCodexLine returns null for malformed JSON', () => {
  assert.equal(parseCodexLine('{nope'), null);
});

test('parseCodexLine returns null for empty lines', () => {
  assert.equal(parseCodexLine(''), null);
});
```

Append a stub to `scripts/lib/token-parsers.ts`:

```ts
export function parseCodexLine(_line: string): ParsedTokens | null {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx tsx scripts/lib/token-parsers.test.ts`
Expected: 7 new `parseCodexLine` tests fail; previous 10 still pass.

- [ ] **Step 3: Implement `parseCodexLine`**

Replace the stub:

```ts
export function parseCodexLine(line: string): ParsedTokens | null {
  if (!line.trim()) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (o.type !== 'event_msg') return null;
  const payload = o.payload as Record<string, unknown> | undefined;
  if (!payload || payload.type !== 'token_count') return null;
  const info = payload.info as Record<string, unknown> | undefined;
  const last = info?.last_token_usage as Record<string, unknown> | undefined;
  const tokens = typeof last?.total_tokens === 'number' ? Math.floor(last.total_tokens) : 0;
  if (tokens <= 0) return null;
  const ts = o.timestamp;
  if (typeof ts !== 'string') return null;
  return { date: localDateOf(ts), tokens };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx scripts/lib/token-parsers.test.ts`
Expected: 17 tests pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/token-parsers.ts scripts/lib/token-parsers.test.ts
git commit -m "feat(scraper): add parseCodexLine"
```

---

## Task 4: Add `token_usage` table to schema and migration

**Files:**
- Modify: `scripts/init-db.sql`
- Create: `scripts/migrate-add-token-usage.ts`

- [ ] **Step 1: Append to `scripts/init-db.sql`**

Append (after the existing `idx_daily_records_date` index):

```sql

CREATE TABLE IF NOT EXISTS token_usage (
  date         DATE   NOT NULL,
  tool         TEXT   NOT NULL,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (date, tool)
);

CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date DESC);
```

- [ ] **Step 2: Create the migration script**

Create `scripts/migrate-add-token-usage.ts`:

```ts
import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

if (!process.env.POSTGRES_URL) {
  console.error('❌ POSTGRES_URL is not defined in .env.local');
  process.exit(1);
}

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});

async function runMigration() {
  try {
    console.log('Running migration: create token_usage table…');

    await sql`
      CREATE TABLE IF NOT EXISTS token_usage (
        date         DATE   NOT NULL,
        tool         TEXT   NOT NULL,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        updated_at   TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (date, tool)
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date DESC);
    `;

    console.log('✅ Migration successful: token_usage table ready.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

runMigration();
```

- [ ] **Step 3: Commit**

```bash
git add scripts/init-db.sql scripts/migrate-add-token-usage.ts
git commit -m "feat(db): add token_usage table schema and migration"
```

---

## Task 5: Run the migration on the local dev DB

**Files:** (no edits — just verifying the migration works against your real DB)

- [ ] **Step 1: Run the migration**

Run: `npx tsx scripts/migrate-add-token-usage.ts`
Expected stdout:
```
Running migration: create token_usage table…
✅ Migration successful: token_usage table ready.
```
Expected exit code: 0.

- [ ] **Step 2: Verify the table exists**

Run (using the same `POSTGRES_URL` as `.env.local`):

```bash
npx tsx -e 'import("postgres").then(async (m) => { import("dotenv").then(async (d) => { d.config({ path: ".env.local" }); const sql = m.default(process.env.POSTGRES_URL); const r = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''token_usage'\'' ORDER BY ordinal_position`; console.log(r); await sql.end(); }); })'
```

Expected: prints 4 columns (`date`, `tool`, `total_tokens`, `updated_at`).

- [ ] **Step 3: No commit** — migration is already committed in Task 4; this task only verifies behavior.

---

## Task 6: Add token_usage helpers to `lib/db.ts`

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Append exports and helpers**

Append to `lib/db.ts`:

```ts
export interface TokenUsageRow {
  date: string;
  tool: 'claude_code' | 'codex';
  total_tokens: number;
  updated_at: Date;
}

export async function getTokenUsage(days: number = 30): Promise<TokenUsageRow[]> {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('Days parameter must be a positive integer');
  }
  try {
    const rows = await sql`
      SELECT date, tool, total_tokens, updated_at
      FROM token_usage
      WHERE date >= CURRENT_DATE - (${days}::int - 1)
      ORDER BY date DESC, tool ASC
    `;
    return rows.map((r) => ({
      date: typeof r.date === 'string' ? r.date : (r.date as Date).toISOString().slice(0, 10),
      tool: r.tool as TokenUsageRow['tool'],
      total_tokens: Number(r.total_tokens),
      updated_at: r.updated_at as Date,
    }));
  } catch (error) {
    console.error('Error fetching token usage:', error);
    throw new Error(`Failed to fetch token usage: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function upsertTokenUsage(
  entries: Array<{ date: string; tool: 'claude_code' | 'codex'; total_tokens: number }>
): Promise<number> {
  if (entries.length === 0) return 0;
  try {
    const result = await sql`
      INSERT INTO token_usage ${sql(entries, 'date', 'tool', 'total_tokens')}
      ON CONFLICT (date, tool)
      DO UPDATE SET total_tokens = EXCLUDED.total_tokens, updated_at = NOW()
    `;
    return result.count ?? entries.length;
  } catch (error) {
    console.error('Error upserting token usage:', error);
    throw new Error(`Failed to upsert token usage: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

Note on the SQL: postgres-js's `sql(array, ...columns)` interpolation builds a parameterized multi-row VALUES list, which is safe and efficient for batch upserts.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat(db): add getTokenUsage and upsertTokenUsage"
```

---

## Task 7: Implement `POST /api/tokens`

**Files:**
- Create: `app/api/tokens/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/tokens/route.ts`:

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual integration test — POST happy path**

Add `TOKEN_REPORT_SECRET=devsecret` to `.env.local` (do not commit). Then:

```bash
# Start the dev server in another terminal: npm run dev
curl -sS -X POST http://localhost:3000/api/tokens \
  -H 'authorization: Bearer devsecret' \
  -H 'content-type: application/json' \
  -d '{"entries":[{"date":"2026-05-19","tool":"claude_code","total_tokens":12345}]}'
```

Expected: `{"updated":1}`.

- [ ] **Step 4: Manual integration test — POST 401**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/tokens \
  -H 'authorization: Bearer wrong' \
  -H 'content-type: application/json' \
  -d '{"entries":[]}'
```

Expected: `401`.

- [ ] **Step 5: Manual integration test — GET**

```bash
curl -sS 'http://localhost:3000/api/tokens?days=7'
```

Expected: JSON `{"entries":[{"date":"2026-05-19","tool":"claude_code","total_tokens":12345,...}]}`.

- [ ] **Step 6: Commit**

```bash
git add app/api/tokens/route.ts
git commit -m "feat(api): add POST/GET /api/tokens"
```

---

## Task 8: Implement `scanClaude` (I/O layer)

**Files:**
- Create: `scripts/report-tokens.ts`

This task adds the orchestrator file and its first I/O function. Subsequent tasks fill in `scanCodex` and `main`.

- [ ] **Step 1: Create the file with `scanClaude` only**

Create `scripts/report-tokens.ts`:

```ts
import { promises as fs, createReadStream } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';
import { parseClaudeLine, parseCodexLine } from './lib/token-parsers';

export async function scanClaude(rootDir: string, cutoffMs: number): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return totals;
    throw e;
  }

  for (const projectDir of entries) {
    if (!projectDir.isDirectory()) continue;
    const projectPath = path.join(rootDir, projectDir.name);
    let sessionFiles: import('node:fs').Dirent[];
    try {
      sessionFiles = await fs.readdir(projectPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of sessionFiles) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const filePath = path.join(projectPath, f.name);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        continue;
      }
      if (stat.mtimeMs < cutoffMs) continue;

      try {
        await consumeJsonl(filePath, (line) => {
          const parsed = parseClaudeLine(line);
          if (!parsed) return;
          totals.set(parsed.date, (totals.get(parsed.date) ?? 0) + parsed.tokens);
        });
      } catch (e) {
        console.error(`warn: failed to read ${filePath}: ${(e as Error).message}`);
      }
    }
  }
  return totals;
}

async function consumeJsonl(filePath: string, onLine: (line: string) => void): Promise<void> {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    onLine(line);
  }
}

// Exported for tasks 9–11 to use:
export { consumeJsonl };
// Re-export for downstream tasks
export { parseClaudeLine, parseCodexLine };

// CLAUDE_ROOT and CODEX_ROOT are defaulted from $HOME; overridable for tests/manual runs.
export const CLAUDE_ROOT = path.join(os.homedir(), '.claude', 'projects');
export const CODEX_ROOT = path.join(os.homedir(), '.codex', 'sessions');
```

- [ ] **Step 2: Smoke test against your real `~/.claude/projects`**

Run an ad-hoc check:

```bash
npx tsx -e 'import("./scripts/report-tokens").then(async m => { const cutoff = Date.now() - 7*86400_000; const out = await m.scanClaude(m.CLAUDE_ROOT, cutoff); console.log([...out.entries()].sort()); })'
```

Expected: prints a `[date, tokens]` array. If you've used Claude Code in the last 7 days, today's date should appear with a non-zero count.

- [ ] **Step 3: Commit**

```bash
git add scripts/report-tokens.ts
git commit -m "feat(scraper): add scanClaude over ~/.claude/projects"
```

---

## Task 9: Implement `scanCodex` (I/O layer)

**Files:**
- Modify: `scripts/report-tokens.ts`

Codex's directory tree is `sessions/YYYY/MM/DD/rollout-*.jsonl`. We descend only into date dirs `>= cutoffDate − 1 day` (the `-1` covers UTC↔local skew, since dir is UTC date and we want local-date attribution).

- [ ] **Step 1: Append `scanCodex` to `scripts/report-tokens.ts`**

```ts
function ymdToUtcMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

export async function scanCodex(rootDir: string, cutoffMs: number): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  // The earliest UTC date we'll descend into: cutoff − 1 day, expressed as a UTC midnight ms.
  const safetyMs = cutoffMs - 86_400_000;

  let yearDirs: import('node:fs').Dirent[];
  try {
    yearDirs = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return totals;
    throw e;
  }

  for (const y of yearDirs) {
    if (!y.isDirectory() || !/^\d{4}$/.test(y.name)) continue;
    const year = parseInt(y.name, 10);
    const yearPath = path.join(rootDir, y.name);

    const monthDirs = await fs.readdir(yearPath, { withFileTypes: true }).catch(() => []);
    for (const mo of monthDirs) {
      if (!mo.isDirectory() || !/^\d{2}$/.test(mo.name)) continue;
      const month = parseInt(mo.name, 10);
      const monthPath = path.join(yearPath, mo.name);

      const dayDirs = await fs.readdir(monthPath, { withFileTypes: true }).catch(() => []);
      for (const d of dayDirs) {
        if (!d.isDirectory() || !/^\d{2}$/.test(d.name)) continue;
        const day = parseInt(d.name, 10);
        if (ymdToUtcMs(year, month, day) < safetyMs) continue;

        const dayPath = path.join(monthPath, d.name);
        const files = await fs.readdir(dayPath, { withFileTypes: true }).catch(() => []);
        for (const f of files) {
          if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
          const filePath = path.join(dayPath, f.name);
          try {
            await consumeJsonl(filePath, (line) => {
              const parsed = parseCodexLine(line);
              if (!parsed) return;
              totals.set(parsed.date, (totals.get(parsed.date) ?? 0) + parsed.tokens);
            });
          } catch (e) {
            console.error(`warn: failed to read ${filePath}: ${(e as Error).message}`);
          }
        }
      }
    }
  }
  return totals;
}
```

- [ ] **Step 2: Smoke test against your real `~/.codex/sessions`**

```bash
npx tsx -e 'import("./scripts/report-tokens").then(async m => { const cutoff = Date.now() - 7*86400_000; const out = await m.scanCodex(m.CODEX_ROOT, cutoff); console.log([...out.entries()].sort()); })'
```

Expected: prints `[date, tokens]` entries for days you've used Codex.

- [ ] **Step 3: Commit**

```bash
git add scripts/report-tokens.ts
git commit -m "feat(scraper): add scanCodex over ~/.codex/sessions"
```

---

## Task 10: Implement scraper `main()` with chunked POST

**Files:**
- Modify: `scripts/report-tokens.ts`

- [ ] **Step 1: Append `main()` and the entrypoint**

Append to `scripts/report-tokens.ts`:

```ts
import dotenv from 'dotenv';

type Entry = { date: string; tool: 'claude_code' | 'codex'; total_tokens: number };

const POST_CHUNK_SIZE = 60;

function loadEnv() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  const dashboardUrl = process.env.DASHBOARD_URL;
  const secret = process.env.TOKEN_REPORT_SECRET;
  const lookback = parseInt(process.env.LOOKBACK_DAYS ?? '7', 10);
  if (!dashboardUrl) throw new Error('DASHBOARD_URL is not set');
  if (!secret) throw new Error('TOKEN_REPORT_SECRET is not set');
  if (!Number.isFinite(lookback) || lookback <= 0) throw new Error('LOOKBACK_DAYS must be a positive integer');
  return { dashboardUrl: dashboardUrl.replace(/\/$/, ''), secret, lookback };
}

function totalsToEntries(claude: Map<string, number>, codex: Map<string, number>): Entry[] {
  const out: Entry[] = [];
  for (const [date, tokens] of claude) out.push({ date, tool: 'claude_code', total_tokens: tokens });
  for (const [date, tokens] of codex) out.push({ date, tool: 'codex', total_tokens: tokens });
  out.sort((a, b) => (a.date === b.date ? a.tool.localeCompare(b.tool) : a.date.localeCompare(b.date)));
  return out;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

async function postChunk(dashboardUrl: string, secret: string, entries: Entry[]): Promise<number> {
  const res = await fetch(`${dashboardUrl}/api/tokens`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /api/tokens failed: ${res.status} ${text}`);
  }
  const data = (await res.json().catch(() => ({}))) as { updated?: number };
  return data.updated ?? entries.length;
}

export async function main(): Promise<void> {
  const { dashboardUrl, secret, lookback } = loadEnv();
  const cutoffMs = Date.now() - lookback * 86_400_000;

  const [claude, codex] = await Promise.all([
    scanClaude(CLAUDE_ROOT, cutoffMs),
    scanCodex(CODEX_ROOT, cutoffMs),
  ]);
  const entries = totalsToEntries(claude, codex);

  let updated = 0;
  for (let i = 0; i < entries.length; i += POST_CHUNK_SIZE) {
    const chunk = entries.slice(i, i + POST_CHUNK_SIZE);
    updated += await postChunk(dashboardUrl, secret, chunk);
  }

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const claudeToday = claude.get(todayStr) ?? 0;
  const codexToday = codex.get(todayStr) ?? 0;
  console.log(
    `reported: ${todayStr} claude_code=${formatTokens(claudeToday)} codex=${formatTokens(codexToday)} ` +
    `(window=${lookback}d, rows=${entries.length}, updated=${updated})`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: End-to-end test against the local dev server**

Start dev server in a separate terminal: `npm run dev`. Make sure `.env.local` has `DASHBOARD_URL=http://localhost:3000` and `TOKEN_REPORT_SECRET=devsecret`.

Run: `npx tsx scripts/report-tokens.ts`
Expected stdout (numbers will vary):
```
reported: 2026-05-19 claude_code=1.2M codex=85.3k (window=7d, rows=8, updated=8)
```
Expected exit code: 0.

- [ ] **Step 3: Verify rows landed in Postgres**

```bash
curl -sS 'http://localhost:3000/api/tokens?days=7'
```
Expected: JSON with `entries` array containing today's date and a non-zero `total_tokens` for at least one tool.

- [ ] **Step 4: Commit**

```bash
git add scripts/report-tokens.ts
git commit -m "feat(scraper): wire main() with chunked POST and summary log"
```

---

## Task 11: Add `report-tokens` npm script and `.env.example` entries

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Add the script**

In `package.json`, inside `"scripts"`, add a `report-tokens` entry. The full `"scripts"` block becomes:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "setup-db": "tsx scripts/setup-db.ts",
  "report-tokens": "tsx scripts/report-tokens.ts"
}
```

- [ ] **Step 2: Append to `.env.example`**

Append:

```bash

# Token usage reporter (local Mac → /api/tokens)
DASHBOARD_URL="http://localhost:3000"
TOKEN_REPORT_SECRET="generate-with: openssl rand -hex 32"
```

- [ ] **Step 3: Commit**

```bash
git add package.json .env.example
git commit -m "chore: add report-tokens npm script and env example"
```

---

## Task 12: Implement `TokenCard`

**Files:**
- Create: `components/TokenCard.tsx`

Visual language matches `FocusCard.tsx`. Read-only (no input form). Token formatting: `1.2M` / `850k` / `12.3k`.

- [ ] **Step 1: Create the component**

Create `components/TokenCard.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface TokenCardProps {
  todayTotal: number;
  todayClaude: number;
  todayCodex: number;
  weeklyAverage: number;
  monthlyAverage: number;
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function TokenCard({
  todayTotal,
  todayClaude,
  todayCodex,
  weeklyAverage,
  monthlyAverage,
}: TokenCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      whileHover={{ y: -5, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.05)' }}
      className="relative rounded-3xl p-8 bg-white/80 backdrop-blur-xl border border-zinc-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 overflow-hidden flex flex-col justify-between"
    >
      <div className="flex justify-between items-start mb-8">
        <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          AI Tokens
        </h2>
      </div>

      <div className="text-center mb-8 flex-1 flex flex-col justify-center">
        <motion.div
          key={todayTotal}
          initial={{ scale: 1.1, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-7xl font-light text-zinc-900 tracking-tight"
        >
          {formatTokens(todayTotal)}
        </motion.div>
        <div className="mt-2 text-sm text-zinc-400 font-medium">Today's Tokens</div>
        <div className="mt-3 text-xs text-zinc-500 font-medium">
          Claude {formatTokens(todayClaude)} · Codex {formatTokens(todayCodex)}
        </div>
      </div>

      <div className="pt-5 border-t border-zinc-100 flex justify-between items-center text-zinc-500">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Averages</div>
        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-medium text-zinc-700">{formatTokens(weeklyAverage)}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Week</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-medium text-zinc-700">{formatTokens(monthlyAverage)}</span>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Month</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/TokenCard.tsx
git commit -m "feat(ui): add TokenCard component"
```

---

## Task 13: Wire TokenCard into the home page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add the SWR fetch, derived totals, and card**

Edit `app/page.tsx`:

1. Update imports (add `TokenCard` and `TokenUsageRow`):

```tsx
import PushupCard from '@/components/PushupCard';
import FocusCard from '@/components/FocusCard';
import TaskCard from '@/components/TaskCard';
import TokenCard from '@/components/TokenCard';
import FloatingVault from '@/components/FloatingVault';
import useSWR from 'swr';
import { DailyRecord, TokenUsageRow } from '@/lib/db';
```

2. Add a third SWR fetch just below the existing two (around the existing `useSWR('/api/records?days=30', fetcher)` line):

```tsx
  const { data: tokensData } = useSWR('/api/tokens?days=30', fetcher);
  const tokenEntries: TokenUsageRow[] = tokensData?.entries || [];
```

3. Add helpers near the existing `calculateWeeklyAverage` (after the existing `calculateTotal` definition):

```tsx
  const tokensByDate = (() => {
    const m = new Map<string, { claude_code: number; codex: number }>();
    for (const e of tokenEntries) {
      const cur = m.get(e.date) ?? { claude_code: 0, codex: 0 };
      cur[e.tool] = e.total_tokens;
      m.set(e.date, cur);
    }
    return m;
  })();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayKey = `${yyyy}-${mm}-${dd}`;
  const todayClaude = tokensByDate.get(todayKey)?.claude_code ?? 0;
  const todayCodex = tokensByDate.get(todayKey)?.codex ?? 0;
  const todayTokens = todayClaude + todayCodex;

  const sortedDailyTotals: number[] = [...tokensByDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => v.claude_code + v.codex);
  const weekTokens = sortedDailyTotals.slice(0, 7);
  const monthTokens = sortedDailyTotals.slice(0, 30);
  const tokensWeeklyAverage = weekTokens.length
    ? Math.round(weekTokens.reduce((a, b) => a + b, 0) / weekTokens.length)
    : 0;
  const tokensMonthlyAverage = monthTokens.length
    ? Math.round(monthTokens.reduce((a, b) => a + b, 0) / monthTokens.length)
    : 0;
```

4. Change the cards grid container class from `md:grid-cols-3` to a 4-column layout. Replace:

```tsx
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
```

with:

```tsx
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
```

5. Add `<TokenCard ... />` after the existing `<TaskCard ... />`:

```tsx
          <TaskCard
            todayTasks={todayRecord.tasks_completed}
            weeklyTotal={calculateTotal('tasks_completed', 7)}
            monthlyTotal={calculateTotal('tasks_completed', 30)}
            onAddTask={handleAddTask}
            isAuthed={isAuthed}
          />
          <TokenCard
            todayTotal={todayTokens}
            todayClaude={todayClaude}
            todayCodex={todayCodex}
            weeklyAverage={tokensWeeklyAverage}
            monthlyAverage={tokensMonthlyAverage}
          />
        </div>
```

- [ ] **Step 2: Run the dev server and verify visually**

Run: `npm run dev`
Browse: `http://localhost:3000`
Expected: Four cards in a single row on `lg:` screens (two-by-two on `md:`). TokenCard shows today's total, the Claude/Codex breakdown line, and week/month averages. If you ran Task 10's end-to-end test against the same DB, today's numbers should be non-zero.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): mount TokenCard on home dashboard"
```

---

## Task 14: Integrate tokens into the analytics page

**Files:**
- Modify: `app/analytics/page.tsx`
- Modify: `components/DashboardAnalytics.tsx`

- [ ] **Step 1: Widen the `DashboardAnalytics` props type**

In `components/DashboardAnalytics.tsx`, change the props interface:

```tsx
type DailyRecordWithTokens = DailyRecord & { total_tokens?: number };

interface DashboardAnalyticsProps {
    records: DailyRecordWithTokens[];
}
```

- [ ] **Step 2: Add `tokens` to `METRICS_CONFIG` and `METRIC_KEYS`**

In `components/DashboardAnalytics.tsx`, change the `MetricKey` type, the `METRICS_CONFIG` const, and the `METRIC_KEYS` array:

```tsx
type MetricKey = 'focus' | 'tasks' | 'exercises' | 'tokens';
```

Inside the `METRICS_CONFIG` object literal, add (alongside the existing `focus` / `tasks` / `exercises` entries):

```tsx
    tokens: {
        label: 'AI Tokens',
        color: '#ec4899',
        icon: Sparkles,
        extractValue: (r) => (r as DailyRecordWithTokens).total_tokens ?? 0,
        metricLabel: 'tokens',
        chartTitle: 'AI Token Usage',
        formatValue: (v) => {
            if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
            if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
            return String(v);
        },
    },
```

Update the `METRIC_KEYS` array:

```tsx
const METRIC_KEYS: MetricKey[] = ['focus', 'tasks', 'exercises', 'tokens'];
```

Update the lucide-react import block at the top of the file to include `Sparkles`:

```tsx
import {
    TrendingUp, TrendingDown, Minus, Timer,
    CheckCircle2, Dumbbell, ChevronDown, ChevronUp,
    Table2, BarChart3, CalendarDays, Sparkles
} from 'lucide-react';
```

Also update the `extractValue` signature in the existing `METRICS_CONFIG` type annotation (top of file) so the function may accept the widened record. Replace the type's `extractValue` line:

```tsx
    extractValue: (r: DailyRecord) => number;
```

with:

```tsx
    extractValue: (r: DailyRecordWithTokens) => number;
```

- [ ] **Step 3: Fetch tokens and merge in the analytics page**

Edit `app/analytics/page.tsx`. Replace the body of the component with:

```tsx
'use client';

import Link from 'next/link';
import DashboardAnalytics from '@/components/DashboardAnalytics';
import BackfillModal from '@/components/BackfillModal';
import { DailyRecord, TokenUsageRow } from '@/lib/db';
import { ArrowLeft } from 'lucide-react';
import useSWR from 'swr';

type DailyRecordWithTokens = DailyRecord & { total_tokens: number };

export default function AnalyticsPage() {
    const fetcher = (url: string) => fetch(url).then(res => res.json());
    const { data: recordsData, mutate } = useSWR('/api/records?days=365', fetcher);
    const { data: tokensData } = useSWR('/api/tokens?days=365', fetcher);

    const baseRecords: DailyRecord[] = recordsData?.records || [];
    const tokenEntries: TokenUsageRow[] = tokensData?.entries || [];
    const loading = !recordsData || !tokensData;

    const tokensByDate = new Map<string, number>();
    for (const e of tokenEntries) {
      tokensByDate.set(e.date, (tokensByDate.get(e.date) ?? 0) + e.total_tokens);
    }
    const records: DailyRecordWithTokens[] = baseRecords.map((r) => ({
      ...r,
      total_tokens: tokensByDate.get(r.date) ?? 0,
    }));

    const fetchData = () => {
        mutate();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50">
                <div className="w-12 h-12 border-4 border-zinc-300 border-t-zinc-800 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-zinc-50 relative overflow-hidden font-sans text-zinc-900 selection:bg-zinc-200">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-multiply pointer-events-none" />
            <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-blue-100/40 to-transparent blur-3xl pointer-events-none" />

            <div className="max-w-7xl mx-auto relative z-10 px-4 sm:px-8 py-12 md:py-20">
                <header className="mb-12 flex items-end justify-between border-b border-zinc-200 pb-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </Link>
                        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900">
                            Analytics
                        </h1>
                    </div>
                    <div className="flex items-center">
                        <BackfillModal onSuccess={fetchData} />
                    </div>
                </header>

                <DashboardAnalytics records={records} />
            </div>
        </main>
    );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify visually**

Run: `npm run dev` (if not already running) and browse `/analytics`.
Expected: the existing metric selector now includes an "AI Tokens" option; selecting it renders a trend chart of daily token totals, with values formatted as `12k` / `1.2M`.

- [ ] **Step 6: Commit**

```bash
git add app/analytics/page.tsx components/DashboardAnalytics.tsx
git commit -m "feat(ui): add AI Tokens metric to analytics"
```

---

## Task 15: launchd plist template + install script

**Files:**
- Create: `scripts/com.life-okr.token-reporter.plist.template`
- Create: `scripts/install-token-reporter.sh`

The user runs `scripts/install-token-reporter.sh` once on their Mac. The script substitutes paths in the plist template, writes it to `~/Library/LaunchAgents/`, and bootstraps it.

- [ ] **Step 1: Create the plist template**

Create `scripts/com.life-okr.token-reporter.plist.template`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.life-okr.token-reporter</string>

    <key>ProgramArguments</key>
    <array>
        <string>__NODE_BIN__</string>
        <string>__TSX_BIN__</string>
        <string>__SCRIPT__</string>
    </array>

    <key>WorkingDirectory</key>
    <string>__PROJECT_DIR__</string>

    <key>StartInterval</key>
    <integer>1800</integer>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>__LOG__</string>

    <key>StandardErrorPath</key>
    <string>__LOG__</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

- [ ] **Step 2: Create the install script**

Create `scripts/install-token-reporter.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${PROJECT_DIR}/scripts/com.life-okr.token-reporter.plist.template"
SCRIPT="${PROJECT_DIR}/scripts/report-tokens.ts"
PLIST_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/com.life-okr.token-reporter.plist"
LOG_DIR="${HOME}/.local/state/life-okr"
LOG_PATH="${LOG_DIR}/reporter.log"

if [[ ! -f "$TEMPLATE" ]]; then
    echo "❌ Template not found at $TEMPLATE" >&2
    exit 1
fi

NODE_BIN="$(command -v node || true)"
TSX_BIN="${PROJECT_DIR}/node_modules/.bin/tsx"
if [[ -z "$NODE_BIN" ]]; then
    echo "❌ node not found in PATH" >&2
    exit 1
fi
if [[ ! -x "$TSX_BIN" ]]; then
    echo "❌ tsx not found at $TSX_BIN — run 'npm install' first" >&2
    exit 1
fi

mkdir -p "$PLIST_DIR" "$LOG_DIR"

sed \
    -e "s|__NODE_BIN__|${NODE_BIN}|g" \
    -e "s|__TSX_BIN__|${TSX_BIN}|g" \
    -e "s|__SCRIPT__|${SCRIPT}|g" \
    -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
    -e "s|__LOG__|${LOG_PATH}|g" \
    "$TEMPLATE" > "$PLIST_PATH"

# Bootstrap (will fail harmlessly if already loaded; bootout first for clean reload).
if launchctl print "gui/$(id -u)/com.life-okr.token-reporter" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)" "$PLIST_PATH" || true
fi
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

echo "✅ Installed launchd job: com.life-okr.token-reporter"
echo "   plist:  $PLIST_PATH"
echo "   log:    $LOG_PATH"
echo "   To disable: launchctl bootout gui/$(id -u) \"$PLIST_PATH\""
echo "   To run now: launchctl kickstart -k gui/$(id -u)/com.life-okr.token-reporter"
```

- [ ] **Step 3: Make the install script executable**

```bash
chmod +x scripts/install-token-reporter.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/com.life-okr.token-reporter.plist.template scripts/install-token-reporter.sh
git commit -m "feat(scheduling): launchd plist template and installer"
```

---

## Task 16: First-run backfill and end-to-end verification

**Files:** (none — verification only)

This task assumes the previous tasks are merged and that **production** env vars are set (Vercel `TOKEN_REPORT_SECRET` matches the local Mac's `.env.local`, and `DASHBOARD_URL` points to the deployed dashboard URL).

- [ ] **Step 1: Run the production migration**

If the production DB has not yet received the `token_usage` table, run the migration against it. Set `POSTGRES_URL` to the production value temporarily (e.g., in a separate shell), then:

```bash
NODE_ENV=production npx tsx scripts/migrate-add-token-usage.ts
```

Expected: `✅ Migration successful: token_usage table ready.` and exit 0.

- [ ] **Step 2: One-shot historical backfill**

With `.env.local` configured to point at production (`DASHBOARD_URL=https://<your-vercel-app>.vercel.app`, `TOKEN_REPORT_SECRET=<prod secret>`):

```bash
LOOKBACK_DAYS=9999 npx tsx scripts/report-tokens.ts
```

Expected: a single summary line, e.g.:
```
reported: 2026-05-19 claude_code=1.4M codex=210k (window=9999d, rows=312, updated=312)
```
Expected exit code: 0.

- [ ] **Step 3: Verify the deployed UI**

Browse the deployed dashboard URL. The TokenCard should show today's number. The `/analytics` page's metric selector should include "AI Tokens", and selecting it should render a populated trend chart over the historical window.

- [ ] **Step 4: Install and start the recurring scheduler**

```bash
bash scripts/install-token-reporter.sh
```

Expected: `✅ Installed launchd job: com.life-okr.token-reporter` plus the plist/log paths.

- [ ] **Step 5: Force one immediate scheduled run and tail the log**

```bash
launchctl kickstart -k "gui/$(id -u)/com.life-okr.token-reporter"
sleep 5
tail -n 20 ~/.local/state/life-okr/reporter.log
```

Expected: a fresh `reported: …` line at the bottom of the log.

- [ ] **Step 6: No commit** — this task is verification only. If any check fails, file the breakage as a follow-up rather than amending committed tasks.

---

## Done criteria

- All 16 task commits land in `main` (or the feature branch).
- `npx tsx scripts/lib/token-parsers.test.ts` exits 0 with all tests passing.
- `npx tsc --noEmit` exits 0.
- The dashboard shows non-zero token values for today.
- The launchd job is loaded and writing fresh `reported:` lines into `~/.local/state/life-okr/reporter.log` every 30 minutes.
