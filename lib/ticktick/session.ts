import { promises as fs } from 'node:fs';
import path from 'node:path';

const SESSION_FILE = '.ticktick-session.json';

export class TickTickNotConfiguredError extends Error {
  constructor() {
    super(
      'TickTick is not configured. Set TICKTICK_COOKIE (the browser `t=...` cookie) in the ' +
        'environment, or place a .ticktick-session.json at the repo root for local development.'
    );
    this.name = 'TickTickNotConfiguredError';
  }
}

/**
 * The cookie the unofficial API authenticates with, as a `t=<token>` Cookie header value.
 *
 * Env first: `.ticktick-session.json` is gitignored and therefore does not exist on Vercel,
 * so production must come from TICKTICK_COOKIE. The file stays as a local-dev fallback so a
 * checkout that already ran `npm run sync-ticktick` needs no extra setup.
 *
 * A bare token is accepted and normalized — it is easy to paste `abc123` instead of `t=abc123`
 * out of devtools, and the resulting 401 would look like an expired session rather than a typo.
 */
export async function resolveTickTickCookie(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): Promise<string> {
  const fromEnv = env.TICKTICK_COOKIE?.trim();
  if (fromEnv) return normalizeCookie(fromEnv);

  const fromFile = await readSessionFile(path.join(cwd, SESSION_FILE));
  if (fromFile) return normalizeCookie(fromFile);

  throw new TickTickNotConfiguredError();
}

export function normalizeCookie(raw: string): string {
  const value = raw.trim();
  return value.includes('=') ? value : `t=${value}`;
}

async function readSessionFile(filePath: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.cookie === 'string' && parsed.cookie.trim() ? parsed.cookie.trim() : null;
  } catch {
    return null;
  }
}
