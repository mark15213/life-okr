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
