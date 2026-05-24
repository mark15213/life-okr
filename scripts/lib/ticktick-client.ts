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
