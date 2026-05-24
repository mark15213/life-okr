import { countCompletedTasksToday, sumFocusMinutesToday, type TickTickPomodoro, type TickTickTask } from './ticktick-aggregate';
import { getLocalDayRange } from './ticktick-date';
import { loadSession, saveSession } from './ticktick-session';

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

export interface UnofficialClientConfig {
  email: string;
  password: string;
  sessionCachePath: string; // absolute path to .ticktick-session.json
}

interface SignonResponse {
  token: string;
  userId: string;
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
