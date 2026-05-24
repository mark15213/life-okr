# TickTick → life-okr Dashboard Sync

**Date:** 2026-05-24
**Status:** Approved (design)

## Goal

Auto-populate the dashboard's Focus Time and Tasks Completed cards from TickTick, so the user no longer has to manually log focus sessions or task completions in two places. Manual entry stays available as a fallback / supplement.

## Non-goals

- Two-way sync (dashboard → TickTick). Read-only from TickTick.
- Historical backfill. Stats begin from the day sync is first enabled.
- Real-time push. A 15-minute polling lag is acceptable.
- Other TickTick data (habits, tags, calendar). Only focus minutes + completed task counts.

## Decisions (locked during brainstorming)

| Topic | Decision |
|---|---|
| API path | **Hybrid**: official Open API (OAuth2) for tasks; unofficial login-based API for Pomodoro/Focus |
| Manual entry UI | Keep as-is. TickTick data is additive to manual values, not a replacement |
| Trigger | `launchd` scheduled job, every 15 minutes (mirrors existing token-reporter setup) |
| Sync window | "Today" only — single day at the user's local timezone |
| Backfill | None |
| Project scope | User has a single TickTick project — no multi-project fan-out needed |
| Credential storage | `.env.local` (gitignored) is acceptable; no Keychain |
| Sync-freshness indicator in UI | Deferred (YAGNI) |

## Architecture

```
┌─────────────────┐   pull today's data   ┌──────────────┐
│ ticktick-sync   │ ───────────────────▶  │ TickTick API │
│ (local script,  │                       │ (OAuth +     │
│  launchd-run)   │                       │  unofficial) │
└────────┬────────┘                       └──────────────┘
         │ upsert today row, _ticktick cols only
         ▼
┌──────────────────────────┐
│ Postgres                 │
│ daily_records:           │
│   focus_minutes          │  ← manual entry (untouched by sync)
│   focus_minutes_ticktick │  ← TickTick sync (new col)
│   tasks_completed        │  ← manual entry (untouched by sync)
│   tasks_completed_ticktick│ ← TickTick sync (new col)
│   ticktick_synced_at     │  ← new col, observability
└──────────┬───────────────┘
           │ SELECT (sums on read)
           ▼
┌─────────────────┐
│ Next.js dashboard│ displays:
│ (FocusCard /     │   focus_minutes + focus_minutes_ticktick
│  TaskCard)       │   tasks_completed + tasks_completed_ticktick
└─────────────────┘
           ▲
           │ manual + button still POSTs to manual cols only
        you tap +
```

## Components

### 1. `scripts/lib/ticktick-client.ts`

Two clients in one module. Both have a single public method that returns a number for "today".

**Official client (tasks):**
- Inputs: `TICKTICK_CLIENT_ID`, `TICKTICK_CLIENT_SECRET`, `TICKTICK_ACCESS_TOKEN`, `TICKTICK_REFRESH_TOKEN` from env.
- Calls `GET /open/v1/project` to list projects (user has one — no concurrency needed), then `GET /open/v1/project/{id}/data` for the project.
- Counts tasks where `status === 2` (completed) AND `completedTime` falls within today's local-time `[00:00, 24:00)` window.
- On 401, refreshes via `POST /open/v1/oauth/token` with `grant_type=refresh_token`, retries once.
- Method: `getCompletedTaskCountToday(): Promise<number>`

**Unofficial client (focus):**
- Inputs: `TICKTICK_EMAIL`, `TICKTICK_PASSWORD`.
- Login: `POST https://api.ticktick.com/api/v2/user/signon?wc=true&remember=true` with JSON body `{username, password}`. Captures `t` cookie from `Set-Cookie`.
- Caches session to `.ticktick-session.json` (project root, gitignored). On startup, reads the file and skips login if cookie exists. On any subsequent 401, deletes the cache and re-logs in once.
- Pulls focus data: `GET /api/v2/pomodoros/timeline?to={epochMs}` with cookie. Filters entries whose `startTime` is today (local), sums `duration` (seconds) → minutes (round to int).
- Method: `getFocusMinutesToday(): Promise<number>`

### 2. `scripts/sync-ticktick.ts`

Top-level script analogous to `scripts/report-tokens.ts`. Pseudocode:

```ts
const today = startOfDayLocal(new Date());
const [taskCount, focusMinutes] = await Promise.all([
  officialClient.getCompletedTaskCountToday(),
  unofficialClient.getFocusMinutesToday(),
]);
// Both must succeed. Any throw → log + process.exit(1), no DB write.
await sql`
  INSERT INTO daily_records (date, focus_minutes_ticktick, tasks_completed_ticktick, ticktick_synced_at)
  VALUES (${today}, ${focusMinutes}, ${taskCount}, NOW())
  ON CONFLICT (date) DO UPDATE SET
    focus_minutes_ticktick = EXCLUDED.focus_minutes_ticktick,
    tasks_completed_ticktick = EXCLUDED.tasks_completed_ticktick,
    ticktick_synced_at = NOW();
`;
```

Critically: the UPSERT touches only the `_ticktick` columns and the timestamp. Manual `focus_minutes` / `tasks_completed` are never written by the sync.

`package.json` gains `"sync-ticktick": "tsx scripts/sync-ticktick.ts"`.

### 3. `scripts/migrate-add-ticktick-cols.ts`

Idempotent migration:

```sql
ALTER TABLE daily_records
  ADD COLUMN IF NOT EXISTS focus_minutes_ticktick INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_completed_ticktick INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ticktick_synced_at TIMESTAMP;
```

`scripts/setup-db.ts` is updated to include the same columns in its `CREATE TABLE`, so new environments don't need the migration.

### 4. `scripts/com.life-okr.ticktick-sync.plist.template` + `scripts/install-ticktick-sync.sh`

Copy of the existing token-reporter pair, swapping:
- Label → `com.life-okr.ticktick-sync`
- Command → `npm run sync-ticktick`
- `StartInterval` → `900` (15 minutes)
- stdout/stderr log paths → `~/Library/Logs/life-okr/ticktick-sync.{out,err}.log`

### 5. Dashboard read-side change

`app/page.tsx` — the SELECT that hydrates FocusCard / TaskCard changes from raw columns to sums:

```sql
SELECT
  date,
  (focus_minutes + focus_minutes_ticktick)        AS focus_minutes_total,
  (tasks_completed + tasks_completed_ticktick)    AS tasks_completed_total,
  ...
FROM daily_records ...
```

FocusCard and TaskCard themselves don't change — they just receive the summed values via their existing props. Manual-entry POST handlers don't change either — they continue to write only the manual columns.

## Data flow on conflict

Sync owns the `_ticktick` cols exclusively. Manual UI owns the non-`_ticktick` cols exclusively. There is no overlap, so no merge logic — the dashboard just sums on read. Re-syncing repeatedly within the same day is safe (it overwrites its own column with the latest authoritative value from TickTick).

## Error handling

| Failure | Behavior |
|---|---|
| Official API returns 5xx / network error | `throw` → exit 1, no DB write, launchd retries in 15 min |
| OAuth refresh fails (refresh token expired/revoked) | `throw` with clear log message instructing user to re-run OAuth flow |
| Unofficial login fails (wrong password, captcha, account locked) | `throw` → exit 1, no DB write |
| Unofficial session cookie expired | One automatic re-login attempt; on second failure, `throw` |
| Either side throws | **Whole sync aborts; nothing is written.** This avoids partial state where, e.g., focus updates but tasks don't, leaving stale task counts visible alongside fresh focus. |

Rationale for all-or-nothing: with `daily_records` upserts touching both `_ticktick` cols atomically, half-updates would silently lie to the user. Better to skip and retry.

## Secrets

Added to `.env.local` (the user provisions manually; never committed):

```
TICKTICK_CLIENT_ID=...
TICKTICK_CLIENT_SECRET=...
TICKTICK_ACCESS_TOKEN=...
TICKTICK_REFRESH_TOKEN=...
TICKTICK_EMAIL=...
TICKTICK_PASSWORD=...
```

`.gitignore` adds `.ticktick-session.json`.

A one-time helper (out of scope for the implementation script, doc-only) walks the user through the OAuth authorization URL flow to obtain the initial access/refresh tokens. Can be a section in README.

## File changelog

**New:**
- `scripts/sync-ticktick.ts`
- `scripts/lib/ticktick-client.ts`
- `scripts/migrate-add-ticktick-cols.ts`
- `scripts/com.life-okr.ticktick-sync.plist.template`
- `scripts/install-ticktick-sync.sh`

**Modified:**
- `scripts/setup-db.ts` (schema parity)
- `app/page.tsx` (SELECT sums `_ticktick` cols)
- `package.json` (add `sync-ticktick` script)
- `.gitignore` (add `.ticktick-session.json`)
- `.env.local` (user adds 6 secrets — not in git)

## Verification checklist

- Run `npm run sync-ticktick` once → today's row has populated `_ticktick` columns and `ticktick_synced_at`.
- Complete a task in TickTick → within 15 min, dashboard task count increases by 1.
- Start & finish a Pomodoro in TickTick → within 15 min, dashboard focus minutes increases accordingly.
- Tap manual "+30 min" in FocusCard → dashboard shows TickTick value + 30, sync still works, manual value never gets zeroed.
- Invalidate `TICKTICK_PASSWORD` → script exits non-zero, DB row unchanged, launchd error log written.
- Re-run sync 5× in a row → today's row stays at the correct TickTick value (idempotent upsert).

## Future / out of scope

- "Last synced at X minutes ago" badge in UI (deferred — add if sync failures become invisible)
- Backfill script for historical data
- Habit / calendar / tag sync
- Migrating to a separate `external_sync` table if more sources (Toggl, Things) are added later
