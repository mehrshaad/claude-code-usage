import * as vscode from 'vscode';

export interface LimitWindow {
  utilization: number;
  resetsAt: number | undefined;
}

export interface UsageReport {
  fiveHour: LimitWindow | undefined;
  sevenDay: LimitWindow | undefined;
  sevenDayOpus: LimitWindow | undefined;
  sevenDaySonnet: LimitWindow | undefined;
  fetchedAt: number;
}

/**
 * Claude reports limit usage as a server-computed percentage - the same numbers
 * `/usage` prints. They cannot be derived from transcript token sums: a window
 * holding 68M transcript tokens reports single-digit utilization, because cache
 * reads barely count toward the limit. So percentages come from the account
 * usage endpoint, and transcripts supply everything else (cost, burn, per-model
 * and per-session breakdowns).
 */
const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const SECRET_KEY = 'claudeUsage.oauthToken';

export class UsageApi {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async hasToken(): Promise<boolean> {
    return (await this.token()) !== undefined;
  }

  async connect(): Promise<boolean> {
    const value = await vscode.window.showInputBox({
      title: 'Connect Claude account',
      prompt: 'Paste a Claude Code OAuth token. Create one with: claude setup-token',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'sk-ant-oat…'
    });
    if (!value) { return false; }
    await this.secrets.store(SECRET_KEY, value.trim());
    return true;
  }

  async disconnect(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
  }

  private async token(): Promise<string | undefined> {
    const stored = await this.secrets.get(SECRET_KEY);
    if (stored) { return stored; }
    const fromEnv = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    return fromEnv ? fromEnv : undefined;
  }

  /** Resolves undefined when no token is configured, throws on a failed call. */
  async fetch(): Promise<UsageReport | undefined> {
    const token = await this.token();
    if (!token) { return undefined; }

    const response = await fetch(ENDPOINT, {
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        accept: 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`usage endpoint returned ${response.status}`);
    }
    return normalize(await response.json() as Record<string, unknown>);
  }
}

function normalize(payload: Record<string, unknown>): UsageReport {
  return {
    fiveHour: windowOf(payload.five_hour),
    sevenDay: windowOf(payload.seven_day),
    sevenDayOpus: windowOf(payload.seven_day_opus),
    sevenDaySonnet: windowOf(payload.seven_day_sonnet),
    fetchedAt: Date.now()
  };
}

function windowOf(value: unknown): LimitWindow | undefined {
  if (!value || typeof value !== 'object') { return undefined; }
  const record = value as Record<string, unknown>;
  const raw = record.utilization;
  if (typeof raw !== 'number') { return undefined; }
  // Normalise to percent; the field has appeared as both a 0-1 and a 0-100 value.
  const utilization = raw <= 1 ? raw * 100 : raw;

  const resets = record.resets_at;
  let resetsAt: number | undefined;
  if (typeof resets === 'string') {
    const parsed = Date.parse(resets);
    resetsAt = Number.isFinite(parsed) ? parsed : undefined;
  } else if (typeof resets === 'number') {
    resetsAt = resets < 1e12 ? resets * 1000 : resets;
  }
  return { utilization, resetsAt };
}
