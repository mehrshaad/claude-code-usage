import * as fs from 'fs';
import * as vscode from 'vscode';
import { buildSnapshot, emptyTotals, filterEvents } from './aggregate';
import { readConfig, resolveProjectsDir } from './config';
import type { Config } from './config';
import { costOf, priceFor } from './pricing';
import { Scanner } from './scanner';
import { DashboardView } from './dashboard';
import { StatusBar, formatTokens } from './statusbar';
import { UsageApi, lastKeychainError } from './usageApi';
import type { UsageReport } from './usageApi';
import type { Snapshot, Totals } from './types';
import { resetSetting, writeSetting } from './settings';

export function activate(context: vscode.ExtensionContext): void {
  let cfg = readConfig();
  let scanner = new Scanner(resolveProjectsDir(cfg));
  let snapshot: Snapshot | undefined;
  let report: UsageReport | undefined;
  let notified = new Set<number>();
  let scanning = false;
  let pending = false;
  let apiWarned = false;

  const api = new UsageApi(context.secrets);
  const statusBar = new StatusBar(cfg);
  const dashboard = new DashboardView(context.extensionUri, cfg);
  statusBar.setScanning();

  let watcher: fs.FSWatcher | undefined;
  let watchTimer: NodeJS.Timeout | undefined;
  let pollTimer: NodeJS.Timeout | undefined;
  let tickTimer: NodeJS.Timeout | undefined;
  let apiTimer: NodeJS.Timeout | undefined;

  const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name;

  /** Pulls the server-computed limit percentages; transcripts cannot produce them. */
  async function refreshAccount(): Promise<void> {
    if (cfg.source === 'transcripts') { report = undefined; return; }
    try {
      const fetched = await api.fetch();
      report = fetched;
      apiWarned = false;
    } catch (err) {
      report = undefined;
      if (!apiWarned) {
        apiWarned = true;
        console.warn('[claude-usage] account usage unavailable', err);
      }
    }
  }

  async function refresh(): Promise<void> {
    if (scanning) { pending = true; return; }
    scanning = true;
    try {
      await scanner.scan(cfg.lookbackDays);
      snapshot = buildSnapshot(scanner.events, cfg, workspaceName, report);
      snapshot.scannedFiles = scanner.scannedFiles;
      statusBar.update(snapshot);
      dashboard.update(snapshot, allTimeTotals(scanner, cfg, workspaceName));
      checkThresholds(snapshot);
    } catch (err) {
      console.error('[claude-usage] refresh failed', err);
    } finally {
      scanning = false;
      if (pending) { pending = false; void refresh(); }
    }
  }

  function checkThresholds(snap: Snapshot): void {
    if (!cfg.notifications.enabled || !snap.block.hasPercent) { return; }
    for (const threshold of cfg.notifications.thresholds) {
      if (snap.block.percent >= threshold && !notified.has(threshold)) {
        notified.add(threshold);
        void vscode.window.showWarningMessage(
          `Claude usage: ${Math.round(snap.block.percent)}% of the current session limit used.`
        );
      }
    }
    // A new window clears the latch so the same warnings fire again next block.
    for (const threshold of [...notified]) {
      if (snap.block.percent < threshold) { notified.delete(threshold); }
    }
  }

  function startWatch(): void {
    watcher?.close();
    watcher = undefined;
    if (!cfg.watchFiles) { return; }
    try {
      watcher = fs.watch(resolveProjectsDir(cfg), { recursive: true, persistent: false }, (_event, filename) => {
        if (filename && !String(filename).endsWith('.jsonl')) { return; }
        if (watchTimer) { clearTimeout(watchTimer); }
        watchTimer = setTimeout(() => void refresh(), 250);
      });
    } catch (err) {
      console.warn('[claude-usage] watch unavailable, falling back to polling', err);
    }
  }

  function startTimers(): void {
    if (pollTimer) { clearInterval(pollTimer); }
    if (tickTimer) { clearInterval(tickTimer); }
    if (apiTimer) { clearInterval(apiTimer); }
    pollTimer = setInterval(() => void refresh(), Math.max(500, cfg.refreshIntervalMs));
    apiTimer = setInterval(async () => {
      await refreshAccount();
      await refresh();
    }, Math.max(15, cfg.apiPollSeconds) * 1000);
    // Keeps the reset countdown moving between scans.
    tickTimer = setInterval(() => {
      if (!snapshot) { return; }
      const now = Date.now();
      snapshot.block.remainingMs = Math.max(0, snapshot.block.end - now);
      snapshot.week.remainingMs = Math.max(0, snapshot.week.end - now);
      statusBar.render();
    }, 1000);
  }

  // Actions posted by the settings surface in the webview.
  dashboard.onAction = (message) => {
    void (async () => {
      const key = typeof message.key === 'string' ? message.key : undefined;
      switch (message.type) {
        case 'set':
          if (key) { await writeSetting(key, message.value); }
          break;
        case 'reset':
          if (key) { await resetSetting(key); }
          break;
        case 'resetMany':
          for (const k of (message.keys as string[] | undefined) ?? []) { await resetSetting(k); }
          break;
        case 'openJson':
          await vscode.commands.executeCommand('workbench.action.openSettingsJson');
          break;
        case 'pickFolder': {
          const picked = await vscode.window.showOpenDialog({
            canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
            title: 'Claude data directory', openLabel: 'Use this folder'
          });
          if (picked?.[0]) { await writeSetting('claudeDir', picked[0].fsPath); }
          break;
        }
        case 'promptNumber': {
          const entered = await vscode.window.showInputBox({
            title: 'Add a threshold',
            prompt: 'Warn at this percentage of the session limit',
            validateInput: (text) => {
              const n = Number(text);
              return Number.isFinite(n) && n >= 1 && n <= 100 ? undefined : 'Enter a number between 1 and 100';
            }
          });
          if (entered && key) {
            const current = vscode.workspace.getConfiguration('claudeUsage').get<number[]>(key) ?? [];
            await writeSetting(key, [...new Set([...current, Number(entered)])].sort((a, b) => a - b));
          }
          break;
        }
        case 'setRate': {
          const model = String(message.model);
          const field = String(message.field);
          const pricing = { ...(vscode.workspace.getConfiguration('claudeUsage').get<Record<string, Record<string, number>>>('cost.pricing') ?? {}) };
          const rates = { ...(pricing[model] ?? {}) };
          if (message.value === null || !Number.isFinite(Number(message.value))) {
            delete rates[field];
          } else {
            rates[field] = Number(message.value);
          }
          if (Object.keys(rates).length) { pricing[model] = rates; } else { delete pricing[model]; }
          await writeSetting('cost.pricing', pricing);
          break;
        }
        default:
          break;
      }
    })();
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardView.viewType, dashboard, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('claudeUsage.openDashboard', () => dashboard.reveal()),
    vscode.commands.registerCommand('claudeUsage.toggleSettings', () => {
      dashboard.reveal();
      dashboard.setSettingsView(!dashboard.isSettingsOpen);
    }),
    vscode.commands.registerCommand('claudeUsage.refresh', async () => {
      await refreshAccount();
      await refresh();
    }),
    vscode.commands.registerCommand('claudeUsage.cycleMetric', () => statusBar.cycle()),
    vscode.commands.registerCommand('claudeUsage.connect', async () => {
      if (!(await api.connect())) { return; }
      await refreshAccount();
      await refresh();
      void vscode.window.showInformationMessage(
        report
          ? 'Claude usage: connected. Session and weekly limits are now live.'
          : 'Claude usage: the token was saved but the usage endpoint did not answer. Check the Claude Usage output for details.'
      );
    }),
    vscode.commands.registerCommand('claudeUsage.disconnect', async () => {
      await api.disconnect();
      report = undefined;
      await refresh();
      void vscode.window.showInformationMessage(
        'Claude usage: the pasted token was removed. A Claude Code sign-in on this machine is still used if present.'
      );
    }),
    vscode.commands.registerCommand('claudeUsage.toggleCost', async () => {
      await vscode.workspace.getConfiguration('claudeUsage').update(
        'cost.enabled', !cfg.cost.enabled, vscode.ConfigurationTarget.Global
      );
    }),
    vscode.commands.registerCommand('claudeUsage.copyStats', async () => {
      if (!snapshot) { return; }
      const cur = cfg.cost.currencySymbol;
      const pct = (p: number, has: boolean) => (has ? `${Math.round(p)}%  ` : '');
      const lines = [
        `Session ${pct(snapshot.block.percent, snapshot.block.hasPercent)}${formatTokens(snapshot.block.totals.counted)} tok  ${cur}${snapshot.block.totals.cost.toFixed(2)}`,
        `Week    ${pct(snapshot.week.percent, snapshot.week.hasPercent)}${formatTokens(snapshot.week.totals.counted)} tok  ${cur}${snapshot.week.totals.cost.toFixed(2)}`,
        `Today   ${formatTokens(snapshot.today.counted)} tok  ${cur}${snapshot.today.cost.toFixed(2)}`,
        ...snapshot.models.map((m) => `${m.model.padEnd(20)} ${formatTokens(m.totals.counted)}`)
      ];
      await vscode.env.clipboard.writeText(lines.join('\n'));
      void vscode.window.showInformationMessage('Claude usage copied to the clipboard.');
    }),
    vscode.commands.registerCommand('claudeUsage.diagnostics', async () => {
      const source = await api.source();
      const lines = [
        `Transcript directory : ${resolveProjectsDir(cfg)}`,
        `Files scanned        : ${snapshot?.scannedFiles ?? 0}`,
        `Messages counted     : ${snapshot?.eventCount ?? 0}`,
        `Percentage source    : ${snapshot?.source ?? 'unknown'}`,
        `Credential found     : ${source}`,
        `Last account error   : ${api.lastError ?? 'none'}`,
        `Keychain read error  : ${lastKeychainError ?? 'none'}`,
        `Status bar           : ${statusBar.debug}`,
        `Lookback days        : ${cfg.lookbackDays}`,
        `Counting             : input=${cfg.countInput} output=${cfg.countOutput} cacheWrites=${cfg.countCacheWrites} cacheReads=${cfg.countCacheReads}`,
        `Project filter       : ${cfg.projectFilter}${cfg.projectFilter === 'currentWorkspace' ? ` (workspace: ${workspaceName ?? 'none'})` : ''}`,
        `30-day history       : ${historySummary(snapshot)}`,
        '',
        source === 'none'
          ? 'No Claude Code credential could be read. On macOS the keychain prompts the first time VS Code reads it - if that prompt was dismissed, quit VS Code, reopen, and choose Always Allow. Otherwise use Claude Usage: Paste Account Token.'
          : 'A credential was found. If percentages are still missing, the error above explains why.'
      ];
      const channel = vscode.window.createOutputChannel('Claude Usage');
      channel.clear();
      channel.appendLine(lines.join('\n'));
      channel.show(true);
    }),
    vscode.commands.registerCommand('claudeUsage.calibrate', async () => {
      if (!snapshot) { return; }
      const ask = async (label: string, counted: number, key: string) => {
        const entered = await vscode.window.showInputBox({
          title: `Calibrate ${label}`,
          prompt: `Claude Code's /usage shows a percentage for the ${label}. Enter it and the ceiling is derived from the ${formatTokens(counted)} tokens counted here. Leave empty to skip.`,
          validateInput: (text) => {
            if (!text.trim()) { return undefined; }
            const n = Number(text.replace('%', ''));
            return Number.isFinite(n) && n > 0 && n <= 100 ? undefined : 'Enter a percentage between 1 and 100';
          }
        });
        if (entered === undefined || !entered.trim()) { return; }
        const percent = Number(entered.replace('%', ''));
        await writeSetting(key, Math.round(counted / (percent / 100)));
      };
      await ask('session', snapshot.block.totals.counted, 'blockTokenLimit');
      await ask('week', snapshot.week.totals.counted, 'weeklyTokenLimit');
      await refresh();
      void vscode.window.showInformationMessage('Claude usage: ceilings calibrated from your own reading.');
    }),
    vscode.commands.registerCommand('claudeUsage.rescan', async () => {
      scanner.reset();
      statusBar.setScanning();
      await refresh();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration('claudeUsage')) { return; }
      const previousDir = resolveProjectsDir(cfg);
      cfg = readConfig();
      statusBar.updateConfig(cfg);
      dashboard.updateConfig(cfg);
      if (resolveProjectsDir(cfg) !== previousDir) {
        scanner = new Scanner(resolveProjectsDir(cfg));
      }
      notified = new Set<number>();
      startWatch();
      startTimers();
      await refreshAccount();
      await refresh();
    }),
    new vscode.Disposable(() => {
      watcher?.close();
      if (watchTimer) { clearTimeout(watchTimer); }
      if (pollTimer) { clearInterval(pollTimer); }
      if (tickTimer) { clearInterval(tickTimer); }
      if (apiTimer) { clearInterval(apiTimer); }
    }),
    statusBar
  );

  startWatch();
  startTimers();
  void (async () => {
    await refreshAccount();
    await refresh();
    // The Claude Code sign-in is picked up automatically; only ask when there
    // is genuinely no credential to find.
    if (!report && cfg.source !== 'transcripts' && (await api.source()) === 'none') {
      const choice = await vscode.window.showInformationMessage(
        'Claude Code Usage: no Claude Code sign-in found, so limit percentages are unavailable. Sign in with Claude Code, or paste a token.',
        'Paste token', 'Not now'
      );
      if (choice === 'Paste token') { await vscode.commands.executeCommand('claudeUsage.connect'); }
    }
  })();
}

/** Days with data, peak and total - the 30-day chart in one line. */
function historySummary(snap: Snapshot | undefined): string {
  if (!snap || !snap.history.length) { return 'no snapshot yet'; }
  const days = snap.history.filter((d) => d.counted > 0);
  if (!days.length) { return `0 of ${snap.history.length} days have data`; }
  const peak = days.reduce((a, b) => (b.counted > a.counted ? b : a));
  return `${days.length} of ${snap.history.length} days, peak ${formatTokens(peak.counted)} on ${peak.date}, ` +
    `first ${days[0].date}, last ${days[days.length - 1].date}`;
}

function allTimeTotals(scanner: Scanner, cfg: Config, workspace: string | undefined): Totals {
  const totals = emptyTotals();
  for (const e of filterEvents(scanner.events, cfg, workspace)) {
    totals.input += e.input;
    totals.output += e.output;
    totals.cacheWrite5m += e.cacheWrite5m;
    totals.cacheWrite1h += e.cacheWrite1h;
    totals.cacheRead += e.cacheRead;
    totals.messages += 1;
    totals.raw += e.input + e.output + e.cacheWrite5m + e.cacheWrite1h + e.cacheRead;
    totals.counted +=
      (cfg.countInput ? e.input : 0) +
      (cfg.countOutput ? e.output : 0) +
      (cfg.countCacheWrites ? e.cacheWrite5m + e.cacheWrite1h : 0) +
      (cfg.countCacheReads ? e.cacheRead : 0);
    if (cfg.cost.enabled) { totals.cost += costOf(e, priceFor(e.model, cfg.cost.pricing)); }
  }
  return totals;
}

export function deactivate(): void {
  // Disposables registered on the context handle teardown.
}
