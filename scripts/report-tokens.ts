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
