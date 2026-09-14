import * as vscode from 'vscode';
import type { Config } from './config';
import type { Snapshot, Totals } from './types';

export class DashboardView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeUsage.dashboard';

  private view: vscode.WebviewView | undefined;
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
      if (msg?.type === 'ready') { this.post(); }
    });
  }

  updateConfig(cfg: Config): void {
    this.cfg = cfg;
    this.post();
  }

  update(snapshot: Snapshot, allTime: Totals): void {
    this.latest = snapshot;
    this.allTime = allTime;
    this.post();
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
        lookbackDays: this.cfg.lookbackDays,
        showModels: this.cfg.dashboard.showModels,
        showSessions: this.cfg.dashboard.showSessions,
        showHistory: this.cfg.dashboard.showHistory
      }
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = String(Math.random()).slice(2) + Date.now().toString(36);
    const css = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.js'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${css}" rel="stylesheet">
<title>Claude Usage</title>
</head>
<body><div id="root"></div><script nonce="${nonce}" src="${js}"></script></body>
</html>`;
  }
}
