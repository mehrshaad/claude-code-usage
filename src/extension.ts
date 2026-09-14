import * as fs from 'fs';
import * as vscode from 'vscode';
import { buildSnapshot, emptyTotals, filterEvents } from './aggregate';
import type { Calibration } from './aggregate';
import { readConfig, resolveProjectsDir } from './config';
import type { Config } from './config';
import { costOf, priceFor } from './pricing';
import { Scanner } from './scanner';
import { DashboardView } from './dashboard';
import { StatusBar, formatTokens } from './statusbar';
import type { PlanId, Snapshot, Totals } from './types';

const CALIBRATION_KEY = 'claudeUsage.calibration';
const PLAN_PICKS: { label: string; id: PlanId; detail: string }[] = [
  { label: 'Claude Pro', id: 'pro', detail: 'Lowest block and weekly ceiling' },
  { label: 'Claude Max 5x', id: 'max5', detail: '5x the Pro allowance' },
  { label: 'Claude Max 20x', id: 'max20', detail: '20x the Pro allowance' },
  { label: 'Team / Enterprise', id: 'team', detail: 'Seat-based allowance' },
  { label: 'API pay-as-you-go', id: 'api', detail: 'No block ceiling - shows raw totals' },
  { label: 'Custom', id: 'custom', detail: 'Use the explicit token limits from settings' }
];

export function activate(context: vscode.ExtensionContext): void {
  let cfg = readConfig();
  let scanner = new Scanner(resolveProjectsDir(cfg));
  let calibration = context.globalState.get<Calibration>(CALIBRATION_KEY) ?? { block: 0, week: 0 };
  let snapshot: Snapshot | undefined;
  let notified = new Set<number>();
  let scanning = false;
  let pending = false;

  const statusBar = new StatusBar(cfg);
  const dashboard = new DashboardView(context.extensionUri, cfg);
  statusBar.setScanning();

  let watcher: fs.FSWatcher | undefined;
  let watchTimer: NodeJS.Timeout | undefined;
  let pollTimer: NodeJS.Timeout | undefined;
  let tickTimer: NodeJS.Timeout | undefined;

  const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name;

  async function refresh(): Promise<void> {
    if (scanning) { pending = true; return; }
    scanning = true;
    try {
      await scanner.scan(cfg.lookbackDays);
      const result = buildSnapshot(scanner.events, cfg, workspaceName, calibration);
      snapshot = result.snapshot;
      snapshot.scannedFiles = scanner.scannedFiles;
      if (result.calibration.block !== calibration.block || result.calibration.week !== calibration.week) {
        calibration = result.calibration;
        void context.globalState.update(CALIBRATION_KEY, calibration);
      }
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
    if (!cfg.notifications.enabled || snap.block.limit <= 0) { return; }
    for (const threshold of cfg.notifications.thresholds) {
      if (snap.block.percent >= threshold && !notified.has(threshold)) {
        notified.add(threshold);
        void vscode.window.showWarningMessage(
          `Claude usage: ${Math.round(snap.block.percent)}% of the ${cfg.blockHours}-hour block used (${formatTokens(snap.block.totals.counted)} tokens).`
        );
      }
    }
    // A new block clears the latch so the same warnings fire again next window.
    for (const threshold of [...notified]) {
      if (snap.block.percent < threshold) { notified.delete(threshold); }
    }
  }

  function startWatch(): void {
    watcher?.close();
    watcher = undefined;
    if (!cfg.watchFiles) { return; }
    const dir = resolveProjectsDir(cfg);
    try {
      watcher = fs.watch(dir, { recursive: true, persistent: false }, (_event, filename) => {
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
    pollTimer = setInterval(() => void refresh(), Math.max(500, cfg.refreshIntervalMs));
    // Keeps the reset countdown moving between scans.
    tickTimer = setInterval(() => {
      if (!snapshot) { return; }
      const now = Date.now();
      snapshot.block.remainingMs = Math.max(0, snapshot.block.end - now);
      snapshot.week.remainingMs = Math.max(0, snapshot.week.end - now);
      statusBar.render();
    }, 1000);
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardView.viewType, dashboard, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('claudeUsage.openDashboard', () => dashboard.reveal()),
    vscode.commands.registerCommand('claudeUsage.refresh', () => refresh()),
    vscode.commands.registerCommand('claudeUsage.cycleMetric', () => statusBar.cycle()),
    vscode.commands.registerCommand('claudeUsage.toggleCost', async () => {
      await vscode.workspace.getConfiguration('claudeUsage').update(
        'cost.enabled', !cfg.cost.enabled, vscode.ConfigurationTarget.Global
      );
    }),
    vscode.commands.registerCommand('claudeUsage.setPlan', async () => {
      const pick = await vscode.window.showQuickPick(
        PLAN_PICKS.map((p) => ({ label: p.label, detail: p.detail, id: p.id })),
        { placeHolder: 'Which Claude plan are you on?' }
      );
      if (!pick) { return; }
      await vscode.workspace.getConfiguration('claudeUsage').update('plan', pick.id, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('claudeUsage.resetCalibration', async () => {
      calibration = { block: 0, week: 0 };
      await context.globalState.update(CALIBRATION_KEY, calibration);
      await refresh();
      void vscode.window.showInformationMessage('Claude usage: calibration reset to the plan preset.');
    }),
    vscode.commands.registerCommand('claudeUsage.rescan', async () => {
      scanner.reset();
      statusBar.setScanning();
      await refresh();
    }),
    vscode.commands.registerCommand('claudeUsage.copyStats', async () => {
      if (!snapshot) { return; }
      const cur = cfg.cost.currencySymbol;
      const lines = [
        `Block   ${Math.round(snapshot.block.percent)}%  ${formatTokens(snapshot.block.totals.counted)} tok  ${cur}${snapshot.block.totals.cost.toFixed(2)}`,
        `Week    ${Math.round(snapshot.week.percent)}%  ${formatTokens(snapshot.week.totals.counted)} tok  ${cur}${snapshot.week.totals.cost.toFixed(2)}`,
        `Today   ${formatTokens(snapshot.today.counted)} tok  ${cur}${snapshot.today.cost.toFixed(2)}`,
        ...snapshot.models.map((m) => `${m.model.padEnd(20)} ${formatTokens(m.totals.counted)}`)
      ];
      await vscode.env.clipboard.writeText(lines.join('\n'));
      void vscode.window.showInformationMessage('Claude usage copied to the clipboard.');
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
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
      void refresh();
    }),
    new vscode.Disposable(() => {
      watcher?.close();
      if (watchTimer) { clearTimeout(watchTimer); }
      if (pollTimer) { clearInterval(pollTimer); }
      if (tickTimer) { clearInterval(tickTimer); }
    }),
    statusBar
  );

  startWatch();
  startTimers();
  void refresh();
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
