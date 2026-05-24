# TickTick Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-populate `FocusCard` and `TaskCard` from TickTick via a local launchd-scheduled sync script that writes today's TickTick focus minutes and completed task count into new `_ticktick` columns on `daily_records`. Manual entry remains untouched and additive.

**Architecture:** Three independent pieces — pure helpers in `scripts/lib/` (date windowing, aggregation, session cache) tested with `node:test`; a hybrid `TickTickClient` that wraps the official OAuth Open API (tasks) and the unofficial cookie-based API (Pomodoro); a top-level `scripts/sync-ticktick.ts` orchestrator wired into launchd via a plist template. Dashboard reads the sum of manual + ticktick columns on display — no read-API change.

**Tech Stack:** TypeScript, tsx, `node:test`, postgres-js, Next.js 16, launchd.

**Spec:** `docs/superpowers/specs/2026-05-24-ticktick-sync-design.md`

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `scripts/lib/ticktick-date.ts` | Pure: `getLocalDayRange(now)` returns `{startMs, endMs}` for today in process TZ. |
| `scripts/lib/ticktick-date.test.ts` | `node:test` unit tests. |
| `scripts/lib/ticktick-aggregate.ts` | Pure: `countCompletedTasksToday(tasks, range)` and `sumFocusMinutesToday(pomodoros, range)`. |
| `scripts/lib/ticktick-aggregate.test.ts` | `node:test` unit tests. |
| `scripts/lib/ticktick-session.ts` | Load/save `.ticktick-session.json` cookie cache; pure file I/O. |
| `scripts/lib/ticktick-session.test.ts` | `node:test` unit tests using a temp file path. |
| `scripts/lib/ticktick-client.ts` | `OfficialClient.getCompletedTaskCountToday()` + `UnofficialClient.getFocusMinutesToday()`. HTTP. |
| `scripts/sync-ticktick.ts` | Top-level orchestrator: both clients in parallel → DB upsert. |
| `scripts/migrate-add-ticktick-cols.ts` | One-off migration to ALTER `daily_records`. |
| `scripts/com.life-okr.ticktick-sync.plist.template` | launchd plist template. |
| `scripts/install-ticktick-sync.sh` | Substitutes placeholders and bootstraps the launchd job. |

### Files to modify

| Path | Change |
|---|---|
| `scripts/setup-db.ts` | Add the 3 new columns to `CREATE TABLE daily_records`. |
| `scripts/init-db.sql` | Same, for fresh DB init. |
| `lib/db.ts` | Extend `DailyRecord` interface with `focus_minutes_ticktick`, `tasks_completed_ticktick`, `ticktick_synced_at`. Add `upsertTicktickSync(date, focusMinutes, taskCount)` helper. |
| `app/page.tsx` | Sum `focus_minutes + focus_minutes_ticktick` (and tasks) at display sites; rest of UI unchanged. |
| `package.json` | Add `"sync-ticktick": "tsx scripts/sync-ticktick.ts"`. |
| `.env.example` | Add 6 `TICKTICK_*` placeholder vars. |
| `.gitignore` | Add `.ticktick-session.json`. |

---

## Task 1: DB migration — add `_ticktick` columns

**Files:**
- Create: `scripts/migrate-add-ticktick-cols.ts`
- Modify: `scripts/setup-db.ts`
- Modify: `scripts/init-db.sql`
- Modify: `lib/db.ts:18-29` (extend `DailyRecord` interface)

- [ ] **Step 1: Create the migration script**

Create `scripts/migrate-add-ticktick-cols.ts`:

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
    console.log('Running migration: add ticktick columns to daily_records…');

    await sql`
      ALTER TABLE daily_records
        ADD COLUMN IF NOT EXISTS focus_minutes_ticktick INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tasks_completed_ticktick INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ticktick_synced_at TIMESTAMP
    `;

    console.log('✅ Migration successful.');
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

- [ ] **Step 2: Run the migration against the dev DB**

Run: `npx tsx scripts/migrate-add-ticktick-cols.ts`
Expected: `✅ Migration successful.` Exit 0.

- [ ] **Step 3: Verify columns exist**

Run:
```bash
psql "$(grep ^POSTGRES_URL .env.local | cut -d= -f2- | tr -d '"')" -c "\d daily_records" | grep ticktick
```
Expected: 3 lines showing `focus_minutes_ticktick`, `tasks_completed_ticktick`, `ticktick_synced_at`.

- [ ] **Step 4: Update `setup-db.ts` for fresh-init parity**

In `scripts/setup-db.ts`, replace the `CREATE TABLE IF NOT EXISTS daily_records (...)` block with:

```ts
await sql`
  CREATE TABLE IF NOT EXISTS daily_records (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    cigarettes INT NOT NULL DEFAULT 0,
    exercises INT NOT NULL DEFAULT 0,
    pushup_balance INT NOT NULL DEFAULT 0,
    focus_minutes INT NOT NULL DEFAULT 0,
    tasks_completed INT NOT NULL DEFAULT 0,
    calories_burned INT NOT NULL DEFAULT 0,
    focus_minutes_ticktick INT NOT NULL DEFAULT 0,
    tasks_completed_ticktick INT NOT NULL DEFAULT 0,
    ticktick_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`;
```

- [ ] **Step 5: Update `init-db.sql` for the same parity**

In `scripts/init-db.sql`, replace the `CREATE TABLE IF NOT EXISTS daily_records (...)` block with:

```sql
CREATE TABLE IF NOT EXISTS daily_records (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  cigarettes INT NOT NULL DEFAULT 0,
  exercises INT NOT NULL DEFAULT 0,
  pushup_balance INT NOT NULL DEFAULT 0,
  focus_minutes INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  calories_burned INT NOT NULL DEFAULT 0,
  focus_minutes_ticktick INT NOT NULL DEFAULT 0,
  tasks_completed_ticktick INT NOT NULL DEFAULT 0,
  ticktick_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

- [ ] **Step 6: Extend `DailyRecord` in `lib/db.ts`**

In `lib/db.ts`, replace the `DailyRecord` interface (lines 18-29) with:

```ts
export interface DailyRecord {
  id: number;
  date: string;
  cigarettes: number;
  exercises: number;
  pushup_balance: number;
  focus_minutes: number;
  tasks_completed: number;
  calories_burned: number;
  focus_minutes_ticktick: number;
  tasks_completed_ticktick: number;
  ticktick_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
```

- [ ] **Step 7: Verify the app still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/migrate-add-ticktick-cols.ts scripts/setup-db.ts scripts/init-db.sql lib/db.ts
git commit -m "feat(db): add ticktick sync columns to daily_records"
```

---

## Task 2: Pure helper — `getLocalDayRange` (TDD)

**Files:**
- Create: `scripts/lib/ticktick-date.ts`
- Create: `scripts/lib/ticktick-date.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/ticktick-date.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getLocalDayRange } from './ticktick-date';

test('getLocalDayRange returns midnight-to-midnight ms in process TZ', () => {
  const now = new Date('2026-05-24T15:30:00Z');
  const { startMs, endMs } = getLocalDayRange(now);

  // start should be at hour 0 in local TZ
  assert.equal(new Date(startMs).getHours(), 0);
  assert.equal(new Date(startMs).getMinutes(), 0);
  assert.equal(new Date(startMs).getSeconds(), 0);
  assert.equal(new Date(startMs).getMilliseconds(), 0);

  // end should be exactly 24h later
  assert.equal(endMs - startMs, 24 * 60 * 60 * 1000);

  // `now` should fall inside [start, end)
  assert.ok(startMs <= now.getTime() && now.getTime() < endMs);
});

test('getLocalDayRange: same day across multiple times-of-day produces same range', () => {
  const morning = new Date(2026, 4, 24, 7, 0, 0);   // May 24 07:00 local
  const evening = new Date(2026, 4, 24, 22, 0, 0);  // May 24 22:00 local
  const a = getLocalDayRange(morning);
  const b = getLocalDayRange(evening);
  assert.equal(a.startMs, b.startMs);
  assert.equal(a.endMs, b.endMs);
});
```

Create `scripts/lib/ticktick-date.ts`:

```ts
export interface LocalDayRange {
  startMs: number;
  endMs: number;
}

export function getLocalDayRange(_now: Date): LocalDayRange {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/lib/ticktick-date.test.ts`
Expected: tests fail with "not implemented".

- [ ] **Step 3: Implement `getLocalDayRange`**

Replace the body in `scripts/lib/ticktick-date.ts`:

```ts
export interface LocalDayRange {
  startMs: number;
  endMs: number;
}

export function getLocalDayRange(now: Date): LocalDayRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/lib/ticktick-date.test.ts`
Expected: 2 tests pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ticktick-date.ts scripts/lib/ticktick-date.test.ts
git commit -m "feat(sync): add getLocalDayRange helper"
```

---

## Task 3: Pure helper — `countCompletedTasksToday` (TDD)

**Files:**
- Create: `scripts/lib/ticktick-aggregate.ts`
- Create: `scripts/lib/ticktick-aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/ticktick-aggregate.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { countCompletedTasksToday } from './ticktick-aggregate';

const range = {
  startMs: new Date(2026, 4, 24, 0, 0, 0).getTime(),
  endMs: new Date(2026, 4, 25, 0, 0, 0).getTime(),
};

test('counts only status=2 tasks completed within today range', () => {
  const tasks = [
    { status: 2, completedTime: new Date(2026, 4, 24, 10, 0, 0).toISOString() },  // today, done
    { status: 2, completedTime: new Date(2026, 4, 24, 23, 59, 59).toISOString() }, // today, done
    { status: 2, completedTime: new Date(2026, 4, 23, 23, 0, 0).toISOString() },  // yesterday — skip
    { status: 0, completedTime: null },                                              // not done — skip
    { status: 2, completedTime: null },                                              // done but no time — skip
    { status: 2, completedTime: new Date(2026, 4, 25, 0, 0, 1).toISOString() },    // tomorrow — skip
  ];
  assert.equal(countCompletedTasksToday(tasks, range), 2);
});

test('returns 0 on empty list', () => {
  assert.equal(countCompletedTasksToday([], range), 0);
});

test('handles malformed completedTime by skipping', () => {
  const tasks = [
    { status: 2, completedTime: 'not-a-date' },
    { status: 2, completedTime: new Date(2026, 4, 24, 12, 0, 0).toISOString() },
  ];
  assert.equal(countCompletedTasksToday(tasks, range), 1);
});
```

Create `scripts/lib/ticktick-aggregate.ts`:

```ts
import type { LocalDayRange } from './ticktick-date';

export interface TickTickTask {
  status: number;
  completedTime: string | null;
}

export interface TickTickPomodoro {
  startTime: string;
  duration: number; // seconds
}

export function countCompletedTasksToday(_tasks: TickTickTask[], _range: LocalDayRange): number {
  throw new Error('not implemented');
}

export function sumFocusMinutesToday(_pomodoros: TickTickPomodoro[], _range: LocalDayRange): number {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/lib/ticktick-aggregate.test.ts`
Expected: 3 tests fail with "not implemented".

- [ ] **Step 3: Implement `countCompletedTasksToday`**

Replace `countCompletedTasksToday` in `scripts/lib/ticktick-aggregate.ts`:

```ts
export function countCompletedTasksToday(tasks: TickTickTask[], range: LocalDayRange): number {
  let count = 0;
  for (const t of tasks) {
    if (t.status !== 2) continue;
    if (!t.completedTime) continue;
    const ms = new Date(t.completedTime).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= range.startMs && ms < range.endMs) count++;
  }
  return count;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/lib/ticktick-aggregate.test.ts`
Expected: 3 tests pass (the `sumFocusMinutesToday` tests don't exist yet so are not run).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ticktick-aggregate.ts scripts/lib/ticktick-aggregate.test.ts
git commit -m "feat(sync): add countCompletedTasksToday aggregator"
```

---

## Task 4: Pure helper — `sumFocusMinutesToday` (TDD)

**Files:**
- Modify: `scripts/lib/ticktick-aggregate.ts`
- Modify: `scripts/lib/ticktick-aggregate.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `scripts/lib/ticktick-aggregate.test.ts`:

```ts
import { sumFocusMinutesToday } from './ticktick-aggregate';

test('sums pomodoro durations that started today, returns rounded minutes', () => {
  const pomodoros = [
    { startTime: new Date(2026, 4, 24, 9, 0, 0).toISOString(), duration: 1500 },   // 25 min today
    { startTime: new Date(2026, 4, 24, 14, 30, 0).toISOString(), duration: 1800 }, // 30 min today
    { startTime: new Date(2026, 4, 23, 22, 0, 0).toISOString(), duration: 1500 },  // yesterday — skip
    { startTime: 'not-a-date', duration: 600 },                                     // malformed — skip
  ];
  // 1500 + 1800 = 3300s = 55 min
  assert.equal(sumFocusMinutesToday(pomodoros, range), 55);
});

test('sumFocusMinutesToday rounds to nearest integer minute', () => {
  const pomodoros = [
    { startTime: new Date(2026, 4, 24, 9, 0, 0).toISOString(), duration: 90 }, // 1.5 min → 2
  ];
  assert.equal(sumFocusMinutesToday(pomodoros, range), 2);
});

test('sumFocusMinutesToday returns 0 on empty list', () => {
  assert.equal(sumFocusMinutesToday([], range), 0);
});
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npx tsx scripts/lib/ticktick-aggregate.test.ts`
Expected: 3 new tests fail with "not implemented"; the 3 task tests still pass.

- [ ] **Step 3: Implement `sumFocusMinutesToday`**

Replace `sumFocusMinutesToday` in `scripts/lib/ticktick-aggregate.ts`:

```ts
export function sumFocusMinutesToday(pomodoros: TickTickPomodoro[], range: LocalDayRange): number {
  let totalSeconds = 0;
  for (const p of pomodoros) {
    const ms = new Date(p.startTime).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= range.startMs && ms < range.endMs) {
      totalSeconds += p.duration;
    }
  }
  return Math.round(totalSeconds / 60);
}
```

- [ ] **Step 4: Run test to verify all pass**

Run: `npx tsx scripts/lib/ticktick-aggregate.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ticktick-aggregate.ts scripts/lib/ticktick-aggregate.test.ts
git commit -m "feat(sync): add sumFocusMinutesToday aggregator"
```

---

## Task 5: Session cache (TDD)

**Files:**
- Create: `scripts/lib/ticktick-session.ts`
- Create: `scripts/lib/ticktick-session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/ticktick-session.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadSession, saveSession } from './ticktick-session';

async function tmpPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ticktick-session-test-'));
  return path.join(dir, 'session.json');
}

test('loadSession returns null when file does not exist', async () => {
  const p = await tmpPath();
  assert.equal(await loadSession(p), null);
});

test('saveSession then loadSession round-trips', async () => {
  const p = await tmpPath();
  await saveSession(p, { cookie: 't=abc123; Path=/' });
  const loaded = await loadSession(p);
  assert.deepEqual(loaded, { cookie: 't=abc123; Path=/' });
});

test('loadSession returns null when file is malformed JSON', async () => {
  const p = await tmpPath();
  await fs.writeFile(p, 'not json{');
  assert.equal(await loadSession(p), null);
});
```

Create `scripts/lib/ticktick-session.ts`:

```ts
export interface TickTickSession {
  cookie: string;
}

export async function loadSession(_filePath: string): Promise<TickTickSession | null> {
  throw new Error('not implemented');
}

export async function saveSession(_filePath: string, _session: TickTickSession): Promise<void> {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/lib/ticktick-session.test.ts`
Expected: 3 tests fail.

- [ ] **Step 3: Implement the cache**

Replace `scripts/lib/ticktick-session.ts`:

```ts
import { promises as fs } from 'node:fs';

export interface TickTickSession {
  cookie: string;
}

export async function loadSession(filePath: string): Promise<TickTickSession | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.cookie === 'string') return { cookie: parsed.cookie };
    return null;
  } catch {
    return null;
  }
}

export async function saveSession(filePath: string, session: TickTickSession): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(session), { mode: 0o600 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/lib/ticktick-session.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ticktick-session.ts scripts/lib/ticktick-session.test.ts
git commit -m "feat(sync): add ticktick session cache helpers"
```

---

## Task 6: Official TickTick client (OAuth + task count)

**Files:**
- Create: `scripts/lib/ticktick-client.ts` (this task adds the `OfficialClient` half; Task 7 adds the other half)

- [ ] **Step 1: Create the official client**

Create `scripts/lib/ticktick-client.ts`:

```ts
import { countCompletedTasksToday, type TickTickTask } from './ticktick-aggregate';
import { getLocalDayRange } from './ticktick-date';

export interface OfficialClientConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export class OfficialClient {
  private accessToken: string;
  private refreshToken: string;
  constructor(private readonly cfg: OfficialClientConfig) {
    this.accessToken = cfg.accessToken;
    this.refreshToken = cfg.refreshToken;
  }

  async getCompletedTaskCountToday(): Promise<number> {
    // 1. List projects. User has one — we sum across all just in case.
    const projects = await this.authedGet<Array<{ id: string }>>(
      'https://api.ticktick.com/open/v1/project'
    );

    // 2. Pull each project's task list. The /data endpoint returns { project, tasks, columns }.
    const range = getLocalDayRange(new Date());
    let total = 0;
    for (const p of projects) {
      const data = await this.authedGet<{ tasks: TickTickTask[] }>(
        `https://api.ticktick.com/open/v1/project/${p.id}/data`
      );
      total += countCompletedTasksToday(data.tasks ?? [], range);
    }
    return total;
  }

  private async authedGet<T>(url: string): Promise<T> {
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (res.status === 401) {
      await this.refresh();
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
    }
    if (!res.ok) {
      throw new Error(`TickTick official API ${url} -> ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  private async refresh(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    });
    const res = await fetch('https://ticktick.com/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`TickTick OAuth refresh failed: ${res.status} ${await res.text()}. Re-run the OAuth bootstrap to mint new tokens.`);
    }
    const tok = (await res.json()) as OAuthTokenResponse;
    this.accessToken = tok.access_token;
    if (tok.refresh_token) this.refreshToken = tok.refresh_token;
    console.error('ticktick: refreshed access_token (note: new refresh_token, if any, is not persisted — update .env.local manually)');
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/ticktick-client.ts
git commit -m "feat(sync): add OfficialClient for TickTick Open API"
```

> No unit test for `OfficialClient` itself — it's a thin wrapper around `fetch` and the already-tested `countCompletedTasksToday`. Smoke-tested end-to-end in Task 9.

---

## Task 7: Unofficial TickTick client (login + focus minutes)

**Files:**
- Modify: `scripts/lib/ticktick-client.ts` (append `UnofficialClient`)

- [ ] **Step 1: Append `UnofficialClient`**

Append to `scripts/lib/ticktick-client.ts`:

```ts
import { loadSession, saveSession } from './ticktick-session';
import { sumFocusMinutesToday, type TickTickPomodoro } from './ticktick-aggregate';

export interface UnofficialClientConfig {
  email: string;
  password: string;
  sessionCachePath: string; // absolute path to .ticktick-session.json
}

interface SignonResponse {
  token: string;
  userId: string;
}

export class UnofficialClient {
  private cookie: string | null = null;

  constructor(private readonly cfg: UnofficialClientConfig) {}

  async getFocusMinutesToday(): Promise<number> {
    await this.ensureSession();
    const range = getLocalDayRange(new Date());

    // The TickTick pomodoros/timeline endpoint takes a `to` (ms) param and returns sessions
    // ending before that point, newest first. We query "now" — today's sessions are all included.
    const url = `https://api.ticktick.com/api/v2/pomodoros/timeline?to=${Date.now()}`;
    const pomodoros = await this.authedGet<TickTickPomodoro[]>(url);
    return sumFocusMinutesToday(pomodoros ?? [], range);
  }

  private async ensureSession(): Promise<void> {
    if (this.cookie) return;
    const cached = await loadSession(this.cfg.sessionCachePath);
    if (cached) {
      this.cookie = cached.cookie;
      return;
    }
    await this.login();
  }

  private async login(): Promise<void> {
    const res = await fetch(
      'https://api.ticktick.com/api/v2/user/signon?wc=true&remember=true',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device': JSON.stringify({ platform: 'web', os: 'macOS', device: 'Chrome', name: '', version: 4531, id: '', channel: 'website', campaign: '', websocket: '' }),
        },
        body: JSON.stringify({ username: this.cfg.email, password: this.cfg.password }),
      }
    );
    if (!res.ok) {
      throw new Error(`TickTick login failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as SignonResponse;
    // Cookie is `t=<token>`. Server also sets it in Set-Cookie but we can construct it from body.
    this.cookie = `t=${body.token}`;
    await saveSession(this.cfg.sessionCachePath, { cookie: this.cookie });
  }

  private async authedGet<T>(url: string): Promise<T> {
    let res = await this.requestWithCookie(url);
    if (res.status === 401 || res.status === 403) {
      // Session expired — wipe cache, re-login, retry once
      await this.invalidateSession();
      await this.login();
      res = await this.requestWithCookie(url);
    }
    if (!res.ok) {
      throw new Error(`TickTick unofficial API ${url} -> ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  private async requestWithCookie(url: string): Promise<Response> {
    return fetch(url, {
      headers: {
        Cookie: this.cookie!,
        'x-device': JSON.stringify({ platform: 'web', os: 'macOS', device: 'Chrome', name: '', version: 4531, id: '', channel: 'website', campaign: '', websocket: '' }),
      },
    });
  }

  private async invalidateSession(): Promise<void> {
    this.cookie = null;
    try {
      const { promises: fs } = await import('node:fs');
      await fs.unlink(this.cfg.sessionCachePath);
    } catch {
      // ignore: file may not exist
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/ticktick-client.ts
git commit -m "feat(sync): add UnofficialClient for TickTick pomodoro data"
```

---

## Task 8: DB upsert helper

**Files:**
- Modify: `lib/db.ts` (append helper at end of file)

- [ ] **Step 1: Append the helper**

Append to `lib/db.ts`:

```ts
export async function upsertTicktickSync(
  date: string,
  focusMinutes: number,
  tasksCompleted: number
): Promise<void> {
  try {
    await sql`
      INSERT INTO daily_records (date, focus_minutes_ticktick, tasks_completed_ticktick, ticktick_synced_at)
      VALUES (${date}, ${focusMinutes}, ${tasksCompleted}, NOW())
      ON CONFLICT (date) DO UPDATE SET
        focus_minutes_ticktick = EXCLUDED.focus_minutes_ticktick,
        tasks_completed_ticktick = EXCLUDED.tasks_completed_ticktick,
        ticktick_synced_at = NOW()
    `;
  } catch (error) {
    console.error(`Error upserting ticktick sync for ${date}:`, error);
    throw new Error(`Failed to upsert ticktick sync: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db.ts
git commit -m "feat(db): add upsertTicktickSync helper"
```

---

## Task 9: Top-level sync script + npm script

**Files:**
- Create: `scripts/sync-ticktick.ts`
- Modify: `package.json` (add `sync-ticktick` script)

- [ ] **Step 1: Create the orchestrator**

Create `scripts/sync-ticktick.ts`:

```ts
import dotenv from 'dotenv';
import path from 'node:path';
import { OfficialClient, UnofficialClient } from './lib/ticktick-client';
import { upsertTicktickSync } from '../lib/db';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`❌ Missing env: ${key} (set in .env.local)`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const official = new OfficialClient({
    clientId: requireEnv('TICKTICK_CLIENT_ID'),
    clientSecret: requireEnv('TICKTICK_CLIENT_SECRET'),
    accessToken: requireEnv('TICKTICK_ACCESS_TOKEN'),
    refreshToken: requireEnv('TICKTICK_REFRESH_TOKEN'),
  });
  const unofficial = new UnofficialClient({
    email: requireEnv('TICKTICK_EMAIL'),
    password: requireEnv('TICKTICK_PASSWORD'),
    sessionCachePath: path.resolve(process.cwd(), '.ticktick-session.json'),
  });

  const [tasksCompleted, focusMinutes] = await Promise.all([
    official.getCompletedTaskCountToday(),
    unofficial.getFocusMinutesToday(),
  ]);

  const today = new Date().toISOString().split('T')[0];
  await upsertTicktickSync(today, focusMinutes, tasksCompleted);
  console.log(`✅ ticktick sync ${today}: focus=${focusMinutes}m, tasks=${tasksCompleted}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ ticktick sync failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
```

- [ ] **Step 2: Add npm script**

In `package.json`, in the `scripts` section, add:

```json
"sync-ticktick": "tsx scripts/sync-ticktick.ts"
```

- [ ] **Step 3: Verify the script type-checks and starts (it will fail on missing env)**

Run: `npm run sync-ticktick`
Expected (without env configured): `❌ Missing env: TICKTICK_CLIENT_ID …` and exit 1.

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-ticktick.ts package.json
git commit -m "feat(sync): add sync-ticktick orchestrator script"
```

---

## Task 10: launchd plist template + installer

**Files:**
- Create: `scripts/com.life-okr.ticktick-sync.plist.template`
- Create: `scripts/install-ticktick-sync.sh`

- [ ] **Step 1: Create the plist template**

Create `scripts/com.life-okr.ticktick-sync.plist.template`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.life-okr.ticktick-sync</string>

    <key>ProgramArguments</key>
    <array>
        <string>__NODE_BIN__</string>
        <string>__TSX_BIN__</string>
        <string>__SCRIPT__</string>
    </array>

    <key>WorkingDirectory</key>
    <string>__PROJECT_DIR__</string>

    <key>StartInterval</key>
    <integer>900</integer>

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

- [ ] **Step 2: Create the installer**

Create `scripts/install-ticktick-sync.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${PROJECT_DIR}/scripts/com.life-okr.ticktick-sync.plist.template"
SCRIPT="${PROJECT_DIR}/scripts/sync-ticktick.ts"
PLIST_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/com.life-okr.ticktick-sync.plist"
LOG_DIR="${HOME}/.local/state/life-okr"
LOG_PATH="${LOG_DIR}/ticktick-sync.log"

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

if launchctl print "gui/$(id -u)/com.life-okr.ticktick-sync" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)" "$PLIST_PATH" || true
fi
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

echo "✅ Installed launchd job: com.life-okr.ticktick-sync"
echo "   plist:  $PLIST_PATH"
echo "   log:    $LOG_PATH"
echo "   To disable: launchctl bootout gui/$(id -u) \"$PLIST_PATH\""
echo "   To run now: launchctl kickstart -k gui/$(id -u)/com.life-okr.ticktick-sync"
```

- [ ] **Step 3: Make installer executable**

Run: `chmod +x scripts/install-ticktick-sync.sh`

- [ ] **Step 4: Commit**

```bash
git add scripts/com.life-okr.ticktick-sync.plist.template scripts/install-ticktick-sync.sh
git commit -m "feat(sync): add launchd template and installer for ticktick-sync"
```

> Do **not** run the installer yet — wait until Task 13 verifies the script works end-to-end with real credentials.

---

## Task 11: `.gitignore` and `.env.example`

**Files:**
- Modify: `.gitignore` (add session cache)
- Modify: `.env.example` (document new vars)

- [ ] **Step 1: Add session cache to `.gitignore`**

In `.gitignore`, add a new line at the bottom:

```
# ticktick session cache (contains login token)
.ticktick-session.json
```

- [ ] **Step 2: Document env vars in `.env.example`**

In `.env.example`, append at the bottom:

```
# TickTick sync (scripts/sync-ticktick.ts)
TICKTICK_CLIENT_ID="from-developer.ticktick.com"
TICKTICK_CLIENT_SECRET="from-developer.ticktick.com"
TICKTICK_ACCESS_TOKEN="obtain-via-one-time-oauth-flow"
TICKTICK_REFRESH_TOKEN="obtain-via-one-time-oauth-flow"
TICKTICK_EMAIL="your-ticktick-account-email"
TICKTICK_PASSWORD="your-ticktick-account-password"
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: document ticktick env vars and ignore session cache"
```

---

## Task 12: Dashboard read-side change — display sums

**Files:**
- Modify: `app/page.tsx`

The card components (`FocusCard`, `TaskCard`) stay unchanged — they accept a single number per metric. The page passes the sum of manual + ticktick columns. The optimistic-update handlers continue to operate on the raw manual fields (the manual POST endpoints only write `focus_minutes` / `tasks_completed`), so when SWR re-fetches after the manual POST, the displayed sum increases correctly.

- [ ] **Step 1: Introduce display-value helpers in `app/page.tsx`**

In `app/page.tsx`, just after the `records: DailyRecord[] = recordsData?.records || [];` line (around line 31), add:

```ts
  // Display-side aggregation: manual + ticktick columns are summed for UI.
  // The raw columns remain available on todayRecord for optimistic-update math.
  const displayFocusMinutesToday = todayRecord
    ? todayRecord.focus_minutes + (todayRecord.focus_minutes_ticktick ?? 0)
    : 0;
  const displayTasksCompletedToday = todayRecord
    ? todayRecord.tasks_completed + (todayRecord.tasks_completed_ticktick ?? 0)
    : 0;

  // For weekly/monthly aggregates over the records list, also sum both columns per day.
  const displayRecord = (r: DailyRecord) => ({
    ...r,
    focus_minutes: r.focus_minutes + (r.focus_minutes_ticktick ?? 0),
    tasks_completed: r.tasks_completed + (r.tasks_completed_ticktick ?? 0),
  });
  const displayRecords: DailyRecord[] = records.map(displayRecord);
```

- [ ] **Step 2: Switch the aggregate calculators to use `displayRecords`**

In `app/page.tsx`, replace the `calculateWeeklyAverage`, `calculateMonthlyAverage`, and `calculateTotal` function bodies to read from `displayRecords` instead of `records`:

```ts
  const calculateWeeklyAverage = (field: keyof DailyRecord) => {
    const weekRecords = displayRecords.slice(0, 7);
    if (weekRecords.length === 0) return 0;
    const sum = weekRecords.reduce((acc, r) => acc + (r[field] as number), 0);
    return Math.round(sum / weekRecords.length);
  };

  const calculateMonthlyAverage = (field: keyof DailyRecord) => {
    const monthRecords = displayRecords.slice(0, 30);
    if (monthRecords.length === 0) return 0;
    const sum = monthRecords.reduce((acc, r) => acc + (r[field] as number), 0);
    return Math.round(sum / monthRecords.length);
  };

  const calculateTotal = (field: keyof DailyRecord, days: number) => {
    const selectedRecords = displayRecords.slice(0, days);
    return selectedRecords.reduce((acc, r) => acc + (r[field] as number), 0);
  };
```

- [ ] **Step 3: Pass display values to `FocusCard` and `TaskCard`**

In `app/page.tsx`, change the `<FocusCard ... todayMinutes={todayRecord.focus_minutes}` prop to use the display value, and same for `<TaskCard ... todayTasks={todayRecord.tasks_completed}`:

```tsx
          <FocusCard
            todayMinutes={displayFocusMinutesToday}
            weeklyAverage={calculateWeeklyAverage('focus_minutes')}
            monthlyAverage={calculateMonthlyAverage('focus_minutes')}
            onAddFocus={handleAddFocus}
            isAuthed={isAuthed}
          />
          <TaskCard
            todayTasks={displayTasksCompletedToday}
            weeklyTotal={calculateTotal('tasks_completed', 7)}
            monthlyTotal={calculateTotal('tasks_completed', 30)}
            onAddTask={handleAddTask}
            isAuthed={isAuthed}
          />
```

- [ ] **Step 4: Update optimistic-update handlers to preserve the displayed sum**

The current `handleAddFocus` and `handleAddTask` build an optimistic `todayRecord` by incrementing `focus_minutes`/`tasks_completed`. That math still works because `displayFocusMinutesToday` is recomputed from `todayRecord` on every render. No change needed. **Verify by reading lines 64-84 — no edits required if the logic still reads `todayRecord.focus_minutes + minutes` from the raw record.**

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint app/page.tsx`
Expected: no errors.

- [ ] **Step 6: Smoke-test in the browser**

Run: `npm run dev`
Open `http://localhost:3000`. Confirm:
- Page loads.
- Focus Time and Tasks Completed show their current values (still zero from TickTick at this point; equal to manual values).
- Clicking the manual "+1 Task" button increments the displayed count by 1 (the manual flow still works).

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): sum ticktick + manual columns for FocusCard and TaskCard display"
```

---

## Task 13: End-to-end verification with real TickTick credentials

This task is manual — it depends on the user provisioning credentials. The agent should pause here and instruct the user.

- [ ] **Step 1: Tell the user what they need to do**

Print exactly this message to the user:

> The implementation is code-complete. To go live you need to:
>
> 1. **Get OAuth credentials** at https://developer.ticktick.com:
>    - Register an app, set redirect URI to e.g. `http://localhost:8000/callback`
>    - Note `client_id` and `client_secret`
>    - Visit the authorize URL to get a `code`, then POST to `/oauth/token` with `grant_type=authorization_code` to get `access_token` + `refresh_token`
> 2. **Add all 6 `TICKTICK_*` vars to `.env.local`** (see `.env.example`)
> 3. **Run `npm run sync-ticktick` manually** and confirm:
>    - Exit code 0
>    - Output: `✅ ticktick sync YYYY-MM-DD: focus=Xm, tasks=Y`
>    - `.ticktick-session.json` was created in the project root
>    - DB row for today has populated `focus_minutes_ticktick` and `tasks_completed_ticktick`:
>      ```bash
>      psql "$POSTGRES_URL" -c "SELECT date, focus_minutes, focus_minutes_ticktick, tasks_completed, tasks_completed_ticktick, ticktick_synced_at FROM daily_records WHERE date = CURRENT_DATE;"
>      ```
> 4. **Verify the dashboard adds up correctly**: open `http://localhost:3000`, focus and task counts should equal the SQL row's `focus_minutes + focus_minutes_ticktick` and `tasks_completed + tasks_completed_ticktick` respectively.
> 5. **Install the launchd job**: run `bash scripts/install-ticktick-sync.sh`. Then `tail -f ~/.local/state/life-okr/ticktick-sync.log` and wait up to 15 min — you should see a fresh `✅ ticktick sync` line.
>
> Once all five steps pass, the feature is live.

- [ ] **Step 2: Wait for user confirmation, then close**

Do not commit anything in this task. After the user confirms the manual steps pass, the implementation is complete.

---

## Notes on testing strategy

- Pure helpers (Tasks 2–5) are TDD'd with `node:test` — same pattern as `scripts/lib/token-parsers.test.ts`.
- HTTP clients (Tasks 6–7) are not unit-tested. They are thin wrappers over `fetch` that delegate filtering/aggregation to the already-tested pure functions. The cost of mocking `fetch` + responses for marginal coverage of network glue isn't worth it. They're smoke-tested end-to-end in Task 13.
- The DB upsert helper (Task 8) is integration-only and is exercised in Task 13.

## Notes on failure modes

- If `npm run sync-ticktick` exits non-zero, the launchd log captures the error and the next 15-minute interval will retry. No partial state is written.
- If only one of the two APIs fails, **the whole sync aborts** — this is intentional (per the spec) to avoid half-updated rows where focus is fresh but tasks are stale (or vice versa).
- The OAuth refresh path mints a new `access_token` in memory but **does not persist a new `refresh_token` back to `.env.local`**. TickTick's refresh tokens may or may not rotate — if you see refresh failures after a few weeks, mint a new pair via the OAuth bootstrap and update `.env.local`. (Persisting the rotated token automatically is a future improvement — out of scope.)
