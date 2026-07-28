import {
  categoryFromProjectName,
  countCompletedTasksByCategory,
  sumFocusMinutesByCategory,
  type CategorizedTotal,
  type Category,
  type TickTickPomodoro,
  type TickTickTask,
} from './ticktick-aggregate';
import { getLocalDayRange } from './ticktick-date';
import { loadSession, saveSession } from './ticktick-session';

export interface UnofficialClientConfig {
  email: string;
  password: string;
  sessionCachePath: string; // absolute path to .ticktick-session.json
}

interface SignonResponse {
  token: string;
  userId: string;
}

interface BatchCheckResponse {
  projectProfiles?: Array<{ id?: string; name?: string }>;
}

const X_DEVICE = JSON.stringify({
  platform: 'web',
  os: 'macOS',
  device: 'Chrome',
  name: '',
  version: 4531,
  id: '',
  channel: 'website',
  campaign: '',
  websocket: '',
});

function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

export class UnofficialClient {
  private cookie: string | null = null;

  constructor(private readonly cfg: UnofficialClientConfig) {}

  /**
   * projectId → category, built from the user's TickTick lists. Only ids whose list name
   * matches one of our four categories end up here; everything absent (Inbox included, in
   * either locale) falls through to `uncategorized` at lookup time.
   *
   * Call this first and awaited: it also warms the session cookie, which keeps the two
   * parallel fetches below from each racing into their own `login()`.
   */
  async getProjectMap(): Promise<Map<string, Category>> {
    await this.ensureSession();
    const body = await this.authedGet<BatchCheckResponse>(
      'https://api.ticktick.com/api/v2/batch/check/0'
    );
    const map = new Map<string, Category>();
    for (const p of body?.projectProfiles ?? []) {
      if (!p?.id) continue;
      const category = categoryFromProjectName(p.name);
      if (category !== 'uncategorized') map.set(p.id, category);
    }
    return map;
  }

  async getFocusMinutesToday(): Promise<CategorizedTotal> {
    await this.ensureSession();
    const range = getLocalDayRange(new Date());

    // The TickTick pomodoros/timeline endpoint takes a `to` (ms) param and returns sessions
    // ending before that point, newest first. We query "now" — today's sessions are all included.
    // Each session carries a `tasks[]` of {taskId, title, projectName, startTime, endTime};
    // note it exposes the list *name* only, never a projectId, so focus is categorized by
    // name while tasks below are categorized by id.
    const url = `https://api.ticktick.com/api/v2/pomodoros/timeline?to=${Date.now()}`;
    const pomodoros = await this.authedGet<TickTickPomodoro[]>(url);
    return sumFocusMinutesByCategory(pomodoros ?? [], range);
  }

  async getCompletedTaskCountToday(projectMap: Map<string, Category>): Promise<CategorizedTotal> {
    await this.ensureSession();
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);

    // Unofficial endpoint that includes Inbox tasks (the official /open/v1 endpoint excludes Inbox).
    // Limit 200 covers a very heavy day; raise if anyone ever closes more than that in 24h.
    const url = `https://api.ticktick.com/api/v2/project/all/completed/?from=${encodeURIComponent(fmtLocal(startOfToday))}&to=${encodeURIComponent(fmtLocal(endOfToday))}&limit=200`;
    const tasks = await this.authedGet<TickTickTask[]>(url);
    const range = getLocalDayRange(now);
    return countCompletedTasksByCategory(tasks ?? [], range, projectMap);
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
          'x-device': X_DEVICE,
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
        'x-device': X_DEVICE,
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
