import * as vscode from 'vscode';
import type { Config } from './config';
import type { Snapshot, Totals } from './types';
import { SECTIONS, SETTINGS, readState } from './settings';

export class DashboardView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeUsage.dashboard';

  private view: vscode.WebviewView | undefined;
  private settingsOpen = false;
  /** Reported by the webview so a stale panel script is identifiable. */
  public buildTag = 'not loaded';
  /** What the panel computed and drew for the history chart. */
  public chartReport = 'not reported';
  /** Set by the extension so webview actions can be executed with context. */
  public onAction: ((message: Record<string, unknown>) => void) | undefined;
  private latest: Snapshot | undefined;
  private allTime: Totals | undefined;

  constructor(private readonly extensionUri: vscode.Uri, private cfg: Config) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'build' && typeof msg.tag === 'string') { this.buildTag = msg.tag; return; }
      if (msg?.type === 'chart' && typeof msg.report === 'string') { this.chartReport = msg.report; return; }
      if (msg?.type === 'ready') {
        this.post();
        this.postSettings();
        void this.view?.webview.postMessage({ type: 'view', view: this.settingsOpen ? 'settings' : 'meter' });
        return;
      }
      // Only this extension's own commands may be invoked from the webview.
      if (msg?.type === 'command' && typeof msg.id === 'string' && msg.id.startsWith('claudeUsage.')) {
        void vscode.commands.executeCommand(msg.id);
        return;
      }
      if (msg?.type === 'closeSettings') { this.setSettingsView(false); return; }
      if (msg?.type === 'openLink') {
        const targets: Record<string, string> = {
          usage: 'https://claude.ai/settings/usage',
          docs: 'https://github.com/mehrshaad/claude-code-usage#where-the-percentages-come-from'
        };
        const url = targets[String(msg.link)];
        if (url) { void vscode.env.openExternal(vscode.Uri.parse(url)); }
        return;
      }
      this.onAction?.(msg as Record<string, unknown>);
    });
  }

  updateConfig(cfg: Config): void {
    this.cfg = cfg;
    this.post();
    this.postSettings();
  }

  get isSettingsOpen(): boolean {
    return this.settingsOpen;
  }

  setSettingsView(open: boolean): void {
    this.settingsOpen = open;
    void this.view?.webview.postMessage({ type: 'view', view: open ? 'settings' : 'meter' });
  }

  postSettings(): void {
    if (!this.view) { return; }
    void this.view.webview.postMessage({
      type: 'settings',
      sections: SECTIONS,
      specs: SETTINGS,
      values: readState(),
      runtime: {
        source: this.latest?.source ?? 'transcripts',
        hasPercent: this.latest?.block.hasPercent ?? false,
        costOn: this.cfg.cost.enabled
      }
    });
  }

  update(snapshot: Snapshot, allTime: Totals): void {
    const sourceChanged = this.latest?.source !== snapshot.source
      || this.latest?.block.hasPercent !== snapshot.block.hasPercent;
    this.latest = snapshot;
    this.allTime = allTime;
    this.post();
    // Runtime dimming depends on whether percentages exist at all.
    if (sourceChanged) { this.postSettings(); }
  }

  reveal(): void {
    void vscode.commands.executeCommand('claudeUsage.dashboard.focus');
  }

  private post(): void {
    if (!this.view || !this.latest) { return; }
    void this.view.webview.postMessage({
      type: 'snapshot',
      snapshot: {
        ...this.latest,
        allTime: this.allTime,
        costEnabled: this.cfg.cost.enabled,
        currencySymbol: this.cfg.cost.currencySymbol,
        accentColor: this.cfg.dashboard.accentColor,
        warnThreshold: this.cfg.statusBar.warnThreshold,
        dangerThreshold: this.cfg.statusBar.dangerThreshold,
        weeklyMode: this.cfg.weeklyMode,
        source: this.latest.source,
        opusWeek: this.latest.opusWeek,
        sonnetWeek: this.latest.sonnetWeek,
        lookbackDays: this.cfg.lookbackDays,
        showModels: this.cfg.dashboard.showModels,
        showSessions: this.cfg.dashboard.showSessions,
        showHistory: this.cfg.dashboard.showHistory,
        gaugeStyle: this.cfg.dashboard.gaugeStyle,
        numberFont: this.cfg.dashboard.numberFont
      }
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = String(Math.random()).slice(2) + Date.now().toString(36);
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.css'));
    const settingsCss = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.css'));
    const settingsJs = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'settings.js'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.js'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${css}" rel="stylesheet">
<link href="${settingsCss}" rel="stylesheet">
<title>Claude Usage</title>
</head>
<body><div id="root"></div>
<script nonce="${nonce}" src="${settingsJs}"></script>
<script nonce="${nonce}" src="${js}"></script></body>
</html>`;
  }
}
