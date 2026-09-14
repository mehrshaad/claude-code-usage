import * as vscode from 'vscode';
import type { Config } from './config';
import type { Snapshot, Totals, Window } from './types';

const METER_GLYPHS: Record<string, [string, string]> = {
  blocks: ['█', '░'],
  bars: ['▮', '▯'],
  dots: ['●', '○'],
  ascii: ['#', '-']
};

const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) { return `${(n / 1_000_000_000).toFixed(2)}B`; }
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`; }
  if (n >= 1_000) { return `${(n / 1_000).toFixed(0)}k`; }
  return `${Math.round(n)}`;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) { return '0m'; }
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function meter(percent: number, width: number, style: string, series: number[]): string {
  if (style === 'sparkline') {
    const slice = series.slice(-width);
    const peak = Math.max(1, ...slice);
    return slice.map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((v / peak) * (SPARK.length - 1)))]).join('');
  }
  const [full, empty] = METER_GLYPHS[style] ?? METER_GLYPHS.blocks;
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
  const body = full.repeat(filled) + empty.repeat(width - filled);
  return style === 'ascii' ? `[${body}]` : body;
}

export class StatusBar {
  private item: vscode.StatusBarItem | undefined;
  private snapshot: Snapshot | undefined;
  private cfg: Config;
  private metricOverride: Config['statusBar']['metric'] | undefined;

  constructor(cfg: Config) {
    this.cfg = cfg;
    this.build();
  }

  private build(): void {
    this.item?.dispose();
    const sb = this.cfg.statusBar;
    this.item = vscode.window.createStatusBarItem(
      'claudeUsage.status',
      sb.alignment === 'left' ? vscode.StatusBarAlignment.Left : vscode.StatusBarAlignment.Right,
      sb.priority
    );
    this.item.name = 'Claude Usage';
    this.item.command = sb.clickAction === 'none' ? undefined : `claudeUsage.${
      sb.clickAction === 'openDashboard' ? 'openDashboard' : sb.clickAction
    }`;
    if (sb.enabled) { this.item.show(); }
  }

  get metric(): Config['statusBar']['metric'] {
    return this.metricOverride ?? this.cfg.statusBar.metric;
  }

  cycle(): void {
    const order: Config['statusBar']['metric'][] = ['block', 'week', 'today', 'session'];
    const next = order[(order.indexOf(this.metric) + 1) % order.length];
    this.metricOverride = next;
    this.render();
  }

  updateConfig(cfg: Config): void {
    this.cfg = cfg;
    this.build();
    this.render();
  }

  update(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    this.render();
  }

  setScanning(): void {
    if (!this.item) { return; }
    this.item.text = '$(sync~spin) Claude usage';
    this.item.tooltip = 'Reading Claude Code transcripts…';
  }

  render(): void {
    const item = this.item;
    const snap = this.snapshot;
    if (!item) { return; }
    if (!this.cfg.statusBar.enabled) { item.hide(); return; }
    item.show();
    if (!snap) { return; }

    const sb = this.cfg.statusBar;
    const view = this.view(snap);
    const parts: string[] = [];
    if (sb.showIcon) { parts.push('$(pulse)'); }
    if (sb.showMeter && view.limit > 0) {
      parts.push(meter(view.percent, sb.meterWidth, sb.meterStyle, snap.burnSeries));
    }
    if (sb.showPercent && view.limit > 0) { parts.push(`${Math.round(view.percent)}%`); }
    if (sb.showTokens || view.limit <= 0) { parts.push(formatTokens(view.totals.counted)); }
    if (sb.showCost && snap.costEnabled) {
      parts.push(`${this.cfg.cost.currencySymbol}${view.totals.cost.toFixed(2)}`);
    }
    if (sb.showReset && view.remainingMs > 0 && view.resets) {
      parts.push(`· ${formatDuration(view.remainingMs)}`);
    }
    item.text = parts.join(' ');
    item.tooltip = this.tooltip(snap);

    const danger = view.percent >= sb.dangerThreshold;
    const warn = view.percent >= sb.warnThreshold;
    if (!sb.useColors || view.limit <= 0) {
      item.backgroundColor = undefined;
      item.color = undefined;
    } else if (danger) {
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    } else if (warn) {
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
      item.backgroundColor = undefined;
      item.color = undefined;
    }
  }

  private view(snap: Snapshot): { totals: Totals; percent: number; limit: number; remainingMs: number; resets: boolean; label: string } {
    switch (this.metric) {
      case 'week':
        return { ...window(snap.week), resets: this.cfg.weeklyMode === 'calendar', label: 'Week' };
      case 'today':
        return { totals: snap.today, percent: 0, limit: 0, remainingMs: 0, resets: false, label: 'Today' };
      case 'session': {
        const totals = snap.session?.totals;
        return {
          totals: totals ?? snap.today,
          percent: 0, limit: 0, remainingMs: 0, resets: false,
          label: snap.session ? `Session · ${snap.session.project}` : 'Session'
        };
      }
      default:
        return { ...window(snap.block), resets: true, label: 'Block' };
    }
  }

  private tooltip(snap: Snapshot): vscode.MarkdownString {
    const cur = this.cfg.cost.currencySymbol;
    const md = new vscode.MarkdownString(undefined, true);
    md.supportThemeIcons = true;
    md.isTrusted = true;
    const line = (label: string, w: Window) =>
      `**${label}** ${meter(w.percent, 10, 'blocks', snap.burnSeries)} ${Math.round(w.percent)}% · ${formatTokens(w.totals.counted)} tok` +
      (snap.costEnabled ? ` · ${cur}${w.totals.cost.toFixed(2)}` : '');

    md.appendMarkdown(`${line('5h block', snap.block)}\n\n`);
    md.appendMarkdown(`resets in ${formatDuration(snap.block.remainingMs)} · ${new Date(snap.block.end).toLocaleTimeString()}\n\n`);
    md.appendMarkdown(`${line('Week', snap.week)}\n\n`);
    md.appendMarkdown(`**Today** ${formatTokens(snap.today.counted)} tok`);
    if (snap.costEnabled) { md.appendMarkdown(` · ${cur}${snap.today.cost.toFixed(2)}`); }
    md.appendMarkdown('\n\n');
    if (snap.session) {
      md.appendMarkdown(`**Session** ${snap.session.project} · ${formatTokens(snap.session.totals.counted)} tok\n\n`);
    }
    md.appendMarkdown(`**Burn** ${formatTokens(snap.burnPerMin)} tok/min`);
    if (snap.projectedExhaustionMs !== undefined && snap.block.limit > 0) {
      md.appendMarkdown(` · limit in ~${formatDuration(snap.projectedExhaustionMs)}`);
    }
    md.appendMarkdown('\n\n');
    for (const m of snap.models.slice(0, 4)) {
      md.appendMarkdown(`\`${m.model}\` ${formatTokens(m.totals.counted)}`);
      if (snap.costEnabled) { md.appendMarkdown(` · ${cur}${m.totals.cost.toFixed(2)}`); }
      md.appendMarkdown('\n\n');
    }
    md.appendMarkdown('---\n\n$(graph) Click to open the dashboard');
    return md;
  }

  dispose(): void {
    this.item?.dispose();
  }
}

function window(w: Window): { totals: Totals; percent: number; limit: number; remainingMs: number } {
  return { totals: w.totals, percent: w.percent, limit: w.limit, remainingMs: w.remainingMs };
}
