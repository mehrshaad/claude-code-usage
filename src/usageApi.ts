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

export interface UsageStatus {
  tokenSource: TokenSource;
  lastSuccessAt: number | undefined;
  lastError: string | undefined;
  consecutiveFailures: number;
  nextAttemptAt: number;
}

/**
 * Claude reports limit usage as a server-computed percentage - the same numbers
 * `/usage` prints. They cannot be derived from transcript token sums, so they
 * come from the account usage endpoint.
 *
 * The reading is served stale-while-revalidate. A long-lived editor will hit
 * token rotation, rate limiting, sleep/wake and VPN transitions; treating any
 * one of those as "no account" made the panel flip between real percentages and
 * a connect prompt every few minutes. A percentage minutes old is far closer to
 * the truth than no percentage at all, so the last good reading is kept until
 * either it goes properly stale or its own window resets.
 */
const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
const SECRET_KEY = 'claudeUsage.oauthToken';
const KEYCHAIN_SERVICE = 'Claude Code-credentials';

/** How long a reading stays usable when refreshes are failing. */
const MAX_STALE_MS = 15 * 60_000;
/** Backoff bounds for repeated failures, so a dead endpoint is not hammered. */
const BACKOFF_BASE_MS = 15_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export class UsageApi {
  private token: { value: string; source: TokenSource } | undefined;
  private good: { report: UsageReport; at: number } | undefined;
  private failures = 0;
  private nextAttemptAt = 0;
  public lastError: string | undefined;
  private lastSuccessAt: number | undefined;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  get status(): UsageStatus {
    return {
      tokenSource: this.token?.source ?? 'none',
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      consecutiveFailures: this.failures,
      nextAttemptAt: this.nextAttemptAt
    };
  }

  /** Age of the served reading, or undefined when there is none. */
  get ageMs(): number | undefined {
    return this.good ? Date.now() - this.good.at : undefined;
  }

  async source(): Promise<TokenSource> {
    return (await this.resolve())?.source ?? 'none';
  }

  /** Fallback for machines where the local credential cannot be read. */
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
    this.invalidateToken();
    this.nextAttemptAt = 0;
    return true;
  }

  async disconnect(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
    this.invalidateToken();
    this.good = undefined;
  }

  private invalidateToken(): void {
    this.token = undefined;
  }

  /**
   * The credential is cached until something rejects it. Re-reading it on a
   * timer meant spawning `security` every other poll, which is both a source of
   * flakiness and a reason for macOS to prompt again.
   */
  private async resolve(force = false): Promise<{ value: string; source: TokenSource } | undefined> {
    if (this.token && !force) { return this.token; }
    const fromClaudeCode = (await readKeychain()) ?? (await readCredentialsFile());
    if (fromClaudeCode) {
      this.token = { value: fromClaudeCode, source: 'claude-code' };
      return this.token;
    }
    const fromEnv = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (fromEnv) {
      this.token = { value: fromEnv, source: 'environment' };
      return this.token;
    }
    const stored = await this.secrets.get(SECRET_KEY);
    this.token = stored ? { value: stored, source: 'manual' } : undefined;
    return this.token;
  }

  private async request(token: string): Promise<Response> {
    return fetch(ENDPOINT, {
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        accept: 'application/json'
      }
    });
  }

  /**
   * Never throws. Returns the freshest reading available, which may be the last
   * good one; undefined only when there has never been a usable reading or the
   * last one has outlived its usefulness.
   */
  async refresh(now = Date.now()): Promise<UsageReport | undefined> {
    if (now < this.nextAttemptAt) { return this.served(now); }

    let resolved = await this.resolve();
    if (!resolved) {
      this.fail('no Claude Code credential found on this machine', now);
      return this.served(now);
    }

    try {
      let response = await this.request(resolved.value);

      // A rejected credential usually means Claude Code rotated it underneath
      // us. Re-read once and retry before declaring anything broken.
      if (response.status === 401 || response.status === 403) {
        this.invalidateToken();
        resolved = await this.resolve(true);
        if (resolved) { response = await this.request(resolved.value); }
      }

      if (!response.ok) {
        this.fail(`usage endpoint returned ${response.status} ${response.statusText}`.trim(), now);
        return this.served(now);
      }

      const report = normalize(await response.json() as Record<string, unknown>);
      this.good = { report, at: now };
      this.lastSuccessAt = now;
      this.lastError = undefined;
      this.failures = 0;
      this.nextAttemptAt = 0;
      return report;
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err), now);
      return this.served(now);
    }
  }

  private fail(message: string, now: number): void {
    this.lastError = message;
    this.failures += 1;
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (this.failures - 1));
    // Jitter keeps several windows from retrying in lockstep.
    this.nextAttemptAt = now + wait * (0.75 + Math.random() * 0.5);
  }

  /** The last good reading, while it is still worth showing. */
  private served(now: number): UsageReport | undefined {
    if (!this.good) { return undefined; }
    const age = now - this.good.at;
    if (age > MAX_STALE_MS) { return undefined; }
    // Never carry a reading across its own reset: the percentage drops to zero
    // there, so a stale one would be reported as current and far too high.
    const resets = this.good.report.fiveHour?.resetsAt;
    if (resets !== undefined && now >= resets) { return undefined; }
    return this.good.report;
  }
}

export let lastKeychainError: string | undefined;

async function readKeychain(): Promise<string | undefined> {
  if (process.platform !== 'darwin') { return undefined; }
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w']);
    return extractToken(stdout.trim());
  } catch (err) {
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
