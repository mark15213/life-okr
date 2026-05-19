import { promises as fs, createReadStream } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';
import dotenv from 'dotenv';
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
