# Token Usage Tracking — Design

**Status**: Approved (design phase)
**Date**: 2026-05-19
**Owner**: shuaiwang

## Goal

Add daily AI token usage (Claude Code + OpenAI Codex CLI) to the life dashboard as a **productivity proxy** — a single number per day that signals "did I lock in?" Similar in spirit to the existing focus-minutes metric.

Non-goals: cost tracking, per-project attribution, per-session drill-down, gamification.

## Decisions (locked in)

| Decision | Choice | Rationale |
|---|---|---|
| Purpose | Productivity proxy | User wants a heads-down signal, not cost or gamification |
| Collection | Fully automatic, local file-scrape | Manual entry won't survive a week; both tools log to JSONL on disk |
| Granularity | One row per (date, tool) | Matches the dashboard's daily card pattern |
| Token sum | All tokens including cache reads | User accepts session-length bias; wants one big total number |
| Day boundary | Local timezone | Day rollups match how the user experiences a day |

## Architecture

Three independent pieces:

```
┌────────────────────────────┐
│  Mac (local)               │
│  ~/.claude/projects/*.jsonl│
│  ~/.codex/sessions/*.jsonl │
│           │                │
│           ▼                │
│  scripts/report-tokens.ts  │ ◄── launchd every 30 min
└───────────┼────────────────┘
            │ HTTPS POST  (Bearer secret)
            ▼
┌────────────────────────────┐
│  Vercel: /api/tokens       │
│  - verifies secret         │
│  - upserts rows            │
│           ▼                │
│  Postgres: token_usage     │
│           ▼                │
│  / and /analytics pages    │
└────────────────────────────┘
```

The scraper, API, and UI are independent. Each can be replaced without touching the others.

## Data model

New table, separate from `daily_records`. Reason: `daily_records` is user-entered behavioral data; token usage is auto-collected telemetry. Mixing them complicates the user-input flows.

```sql
CREATE TABLE IF NOT EXISTS token_usage (
  date         DATE   NOT NULL,
  tool         TEXT   NOT NULL,         -- 'claude_code' | 'codex'
  total_tokens BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (date, tool)
);

CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(date DESC);
```

- `date` is **local date** — the scraper computes it from each message's UTC timestamp before sending.
- `tool` is open text so new tools (`cursor`, `gemini-cli`, …) require no migration.
- Compound PK `(date, tool)` makes the upsert one statement and rules out duplicates.

Migration: add to `scripts/init-db.sql`; provide a one-off `scripts/migrate-add-token-usage.ts` for the existing production DB, matching the pattern of `migrate-add-calories.ts`.

## Components

### 1. Scraper — `scripts/report-tokens.ts`

Standalone TypeScript run via `tsx`. Node built-ins + `dotenv` only; no new deps.

**Env vars** (from `.env.local`):

- `DASHBOARD_URL` — e.g. `https://life-okr.vercel.app`
- `TOKEN_REPORT_SECRET` — shared secret with the API
- `LOOKBACK_DAYS` — default `7`

**Flow:**

1. Compute cutoff = `today (local) − LOOKBACK_DAYS`.
2. **Claude pass**: walk `~/.claude/projects/`, find `*.jsonl`. Skip files whose `mtime < cutoff`. For surviving files, stream lines; for each line that parses as JSON with `message.usage`, extract the four counts and `timestamp`, and bucket their **sum** into `localDate(timestamp)`.
3. **Codex pass**: walk `~/.codex/sessions/YYYY/MM/DD/`, descending only into date dirs `>= cutoff − 1` (one extra day to cover UTC↔local skew). For each `rollout-*.jsonl`, stream lines; for each line with `total_tokens`, bucket by `localDate(timestamp)` from the line itself (not the directory).
4. Build payload `{entries: [{date, tool, total_tokens}, ...]}` for every (date, tool) seen in the window. Days with zero usage are not sent.
5. `POST` to `${DASHBOARD_URL}/api/tokens` in chunks of ≤ 60 entries (one request for normal runs; multiple for backfill) with `Authorization: Bearer ${TOKEN_REPORT_SECRET}`. Any non-2xx response aborts the run.
6. Print one-line summary on success; exit non-zero on any failure.

**Module structure** (~200 lines):

- `parseClaudeLine(line: string): {date: string, tokens: number} | null` — pure function, unit-testable
- `parseCodexLine(line: string): {date: string, tokens: number} | null` — pure
- `localDateOf(isoUtc: string): string` — pure (`YYYY-MM-DD` in process TZ)
- `scanClaude(rootDir, cutoff): Map<date, tokens>` — I/O
- `scanCodex(rootDir, cutoff): Map<date, tokens>` — I/O
- `main()` — orchestrate + HTTP POST

**Token counting** (per the "all tokens incl. cache reads" decision above): sum all four Claude fields (`input + output + cache_creation + cache_read`). For Codex, prefer `total_tokens` if present, else `input + output`.

**Always full recompute over the window.** No state file, no per-file offsets — the entire scan is sub-second for a personal user, and recompute is naturally idempotent for late writes.

### 2. API endpoint — `app/api/tokens/route.ts`

Follows the shape of existing `app/api/records` and `app/api/vault` routes. Uses `lib/db.ts`.

**`POST /api/tokens`**

- Auth: `Authorization: Bearer <secret>` header, constant-time compare against `TOKEN_REPORT_SECRET`. 401 on mismatch.
- Body: `{ entries: [{ date, tool, total_tokens }] }`.
- Validation:
  - `entries` array length ≤ 60 (per-request cap; scraper chunks backfill across multiple requests)
  - `date` matches `^\d{4}-\d{2}-\d{2}$`
  - `tool` ∈ `{'claude_code', 'codex'}`
  - `total_tokens` is a non-negative finite integer
- Write: single multi-row `INSERT ... ON CONFLICT (date, tool) DO UPDATE SET total_tokens = EXCLUDED.total_tokens, updated_at = NOW()`.
- Response: `{ updated: <n> }`.

**`GET /api/tokens?days=30`**

- No auth (matches existing `GET /api/records` pattern — protected at the page level via `usePasscode`).
- Returns `[{ date, tool, total_tokens }, ...]` ordered by `date DESC`, default 30 days.

### 3. UI — dashboard card + analytics trend

**`components/TokenCard.tsx`** — matches the visual language of `FocusCard.tsx`:

- Headline: today's total (Claude + Codex summed), formatted as `1.2M` / `850k` / `12.3k`.
- Sub-line: small Claude/Codex breakdown — `Claude 980k · Codex 250k`.
- Week-average + month-average rows, like other cards.
- Empty state (no data yet today or API failure): show `—`.

Render order on `app/page.tsx`: append after the existing cards (Pushup → Focus → Task → Token).

**Analytics** (`app/analytics/page.tsx` / `components/DashboardAnalytics.tsx`):

- Add a tokens series to the existing trend chart (or a separate panel — implementation plan decides based on chart code).
- Reuses the same `/api/tokens?days=30` SWR fetch from the home page (single key, single network call).

### 4. Scheduling — launchd

`~/Library/LaunchAgents/com.life-okr.token-reporter.plist`:

- `ProgramArguments`: `tsx /Users/shuaiwang/Documents/projects/life-okr/scripts/report-tokens.ts`
- `StartInterval`: `1800` (30 min)
- `StandardOutPath` / `StandardErrorPath`: `~/.local/state/life-okr/reporter.log`
- `RunAtLoad`: `true`

A helper `scripts/install-token-reporter.sh` writes the plist (substituting absolute paths) and runs `launchctl bootstrap gui/$UID <plist>`. Document the `launchctl bootout` invocation to disable.

### 5. Initial backfill

For first run, the user runs `LOOKBACK_DAYS=9999 npx tsx scripts/report-tokens.ts` once. This sweeps all historical sessions and upserts. After that, the scheduled run with `LOOKBACK_DAYS=7` keeps things current and tolerates clock drift / late writes.

## Error handling

| Where | Failure | Behavior |
|---|---|---|
| Scraper | Malformed line / unreadable file | Log to stderr, skip, continue |
| Scraper | Network or API non-2xx | Log to stderr, exit non-zero — launchd retries next interval |
| API | Bad bearer token | 401, no body |
| API | Schema validation fail | 400 with one-line message (no field-by-field detail) |
| API | DB error | 500 (Vercel logs the exception) |
| UI | `/api/tokens` empty or failing | Card shows `—` (matches existing card empty-state behavior) |

## Testing

- **Unit tests** (`node --test` — zero new deps) for the three pure functions: `parseClaudeLine`, `parseCodexLine`, `localDateOf`. Use ~3-5 fixture lines per parser, copied (anonymized) from real JSONL.
- **Integration**: one manual `curl` test against the local Next dev server to exercise the `POST /api/tokens` happy path + 401.
- No CI — personal dashboard.

## Out of scope

- Per-project attribution (no `cwd` tag on rows).
- Per-session detail / drill-down UI.
- Cost (USD) conversion.
- Other tools (Cursor, Gemini CLI). The `tool` column is open text so this is a non-migration when wanted.
- Auto-installing the launchd job from `npm install`. The user runs `install-token-reporter.sh` once.

## Open questions

None at design freeze. Implementation plan may surface chart-layout details (single chart vs. separate panel) — defer to the plan.
