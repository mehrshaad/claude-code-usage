import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const run = promisify(execFile);

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

export type TokenSource = 'claude-code' | 'environment' | 'manual' | 'none';

/**
 * Claude reports limit usage as a server-computed percentage - the same numbers
 * `/usage` prints. They cannot be derived from transcript token sums: a window
 * holding 68M transcript tokens reports single-digit utilization, because cache
 * reads barely count toward the limit. So percentages come from the account
 * usage endpoint, and transcripts supply everything else.
 *
 * The credential is whichever one Claude Code already signed in with, read from
 * the same local store Claude Code uses. Nothing is copied anywhere, and the
 * token is only ever sent to the endpoint below.
 */
const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const SECRET_KEY = 'claudeUsage.oauthToken';
const KEYCHAIN_SERVICE = 'Claude Code-credentials';

export class UsageApi {
  private cached: { token: string; source: TokenSource } | undefined;
  private cachedAt = 0;
  /** Why the last lookup failed, for the diagnostics command. */
  public lastError: string | undefined;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Where the active credential came from, for the panel's footer. */
  async source(): Promise<TokenSource> {
    return (await this.resolve())?.source ?? 'none';
  }

  /** Optional fallback for machines where the local store cannot be read. */
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
    this.invalidate();
    return true;
  }

  async disconnect(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
    this.invalidate();
  }

  invalidate(): void {
    this.cached = undefined;
    this.cachedAt = 0;
  }

  private async resolve(): Promise<{ token: string; source: TokenSource } | undefined> {
    // Re-read periodically: Claude Code refreshes its own token in the background.
    if (this.cached && Date.now() - this.cachedAt < 120_000) { return this.cached; }
    this.cachedAt = Date.now();

    const fromClaudeCode = (await readKeychain()) ?? (await readCredentialsFile());
    if (fromClaudeCode) {
      this.cached = { token: fromClaudeCode, source: 'claude-code' };
      return this.cached;
    }
    const fromEnv = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (fromEnv) {
      this.cached = { token: fromEnv, source: 'environment' };
      return this.cached;
    }
    const stored = await this.secrets.get(SECRET_KEY);
    this.cached = stored ? { token: stored, source: 'manual' } : undefined;
    return this.cached;
  }

  /** Resolves undefined when no credential is available, throws on a failed call. */
  async fetch(): Promise<UsageReport | undefined> {
    const resolved = await this.resolve();
    if (!resolved) {
      this.lastError = 'no Claude Code credential found on this machine';
      return undefined;
    }

    const response = await fetch(ENDPOINT, {
      headers: {
        authorization: `Bearer ${resolved.token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        accept: 'application/json'
      }
    });
    if (!response.ok) {
      // A refreshed or revoked credential invalidates the cache immediately.
      if (response.status === 401 || response.status === 403) { this.invalidate(); }
      this.lastError = `usage endpoint returned ${response.status} ${response.statusText}`;
      throw new Error(this.lastError);
    }
    this.lastError = undefined;
    return normalize(await response.json() as Record<string, unknown>);
  }
}

export let lastKeychainError: string | undefined;

async function readKeychain(): Promise<string | undefined> {
  if (process.platform !== 'darwin') { return undefined; }
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w']);
    return extractToken(stdout.trim());
  } catch (err) {
    // Not present, or the keychain prompt was declined.
    lastKeychainError = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return undefined;
  }
}

async function readCredentialsFile(): Promise<string | undefined> {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  try {
    return extractToken(await fs.promises.readFile(path.join(base, '.credentials.json'), 'utf8'));
  } catch {
    return undefined;
  }
}

function extractToken(raw: string): string | undefined {
  if (!raw) { return undefined; }
  if (!raw.startsWith('{')) { return raw; }
  try {
    const parsed = JSON.parse(raw) as Record<string, any>;
    const oauth = parsed.claudeAiOauth ?? parsed;
    const token = oauth?.accessToken ?? oauth?.access_token;
    return typeof token === 'string' && token ? token : undefined;
  } catch {
    return undefined;
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
