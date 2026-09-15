import * as vscode from 'vscode';
import type { Config } from './config';
import type { Snapshot, Totals, Window } from './types';

const METER_GLYPHS: Record<string, [string, string]> = {
  ticks: ['▮', '▯'],
  circles: ['●', '○'],
  halfblocks: ['█', '░'],
  blocks: ['█', '░'],
  braille: ['⣿', '⣀'],
  ascii: ['#', '-']
};

/** Partial cells for the half-step meter: one cell resolves to ~1.25%. */
const PARTIAL = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
const BRAILLE_PARTIAL = ['', '⣀', '⣤', '⣶'];
/**
 * Half-resolved cells. The quadrant glyphs are gone: they are not metrically
 * compatible across editor fonts, and ◑ fills from the right, which reads
 * backwards in a meter that grows left to right. ◐ fills from the left.
 */
const CIRCLE_PARTIAL = ['', '◐'];
const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) { return `${(n / 1_000_000_000).toFixed(2)}B`; }
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`; }
  if (n >= 1_000) { return `${(n / 1_000).toFixed(0)}k`; }
  return `${Math.round(n)}`;
}

/**
 * Always NhNNm. A fixed shape is the point: the status bar item must not change
 * width as the countdown loses a digit.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60);
  return `${h}h${String(total % 60).padStart(2, '0')}m`;
}

/** Percentages reserve three integer digits so the meter never shifts. */
export function formatPercent(percent: number, estimated = false): string {
  const value = Number.isFinite(percent) ? Math.round(percent) : 0;
  // The tilde is the only thing distinguishing a measured reading from a
  // modelled one, so it never gets dropped for width.
  return `${estimated ? '~' : ''}${String(value).padStart(estimated ? 2 : 3, ' ')}%`;
}

export function meter(percent: number, width: number, style: string, series: number[]): string {
  // circleHalves merged into circles in 0.8.0.
  if (style === 'circleHalves') { style = 'circles'; }
  if (style === 'sparkline') {
    const slice = series.slice(-width);
    const peak = Math.max(1, ...slice);
    return slice.map((v) => SPARK[Math.min(SPARK.length - 1, Math.round((v / peak) * (SPARK.length - 1)))]).join('');
  }

  const [full, empty] = METER_GLYPHS[style] ?? METER_GLYPHS.ticks;
  const safe = Number.isFinite(percent) ? percent : 0;
  const exact = Math.max(0, Math.min(1, safe / 100)) * width;
  const filled = Math.floor(exact);

  // Half-step and braille meters spend their remainder on a partial cell, so the
  // fill creeps between whole segments instead of jumping once per 1/width.
  const steps =
    style === 'halfblocks' ? PARTIAL :
    style === 'braille' ? BRAILLE_PARTIAL :
    style === 'circles' ? CIRCLE_PARTIAL :
    undefined;
  let body: string;
  if (steps && filled < width) {
    // Circle cells round a remainder up to the next quarter - any progress into a
    // cell should be visible. Block and braille cells take the nearest step.
    const toStep = style === 'circles' ? Math.ceil : Math.round;
    const partial = steps[Math.min(steps.length - 1, toStep((exact - filled) * steps.length))] ?? '';
    body = full.repeat(filled) + partial + empty.repeat(width - filled - (partial ? 1 : 0));
  } else {
    const whole = Math.min(width, Math.round(exact));
    body = full.repeat(whole) + empty.repeat(width - whole);
  }
  return style === 'ascii' ? `[${body}]` : body;
}

export class StatusBar {
  private item: vscode.StatusBarItem | undefined;
  private snapshot: Snapshot | undefined;
  private cfg: Config;
  private metricOverride: Config['statusBar']['metric'] | undefined;
  private spinner: NodeJS.Timeout | undefined;
  private spinnerFrame = 0;

  /** Last rendered state, for the diagnostics command. */
  public get debug(): string {
    const sb = this.cfg.statusBar;
    return [
      `enabled=${sb.enabled}`,
      `metric=${this.metric}${this.metricOverride ? ' (cycled)' : ''}`,
      `visible=${this.item ? 'item exists' : 'NO ITEM'}`,
      `text="${this.item?.text ?? ''}"`
    ].join(' · ');
  }

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
    this.apply();
  }

  /** Properties that can change without recreating the item. */
  private apply(): void {
    const item = this.item;
    if (!item) { return; }
    const sb = this.cfg.statusBar;
    item.name = 'Claude Usage';
    item.command = sb.clickAction === 'none' ? undefined : `claudeUsage.${
      sb.clickAction === 'openDashboard' ? 'openDashboard' : sb.clickAction
    }`;
    if (sb.enabled) { item.show(); } else { item.hide(); }
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
    // Only alignment and priority are fixed at creation time. Rebuilding for any
    // other setting disposes a live item and can leave the status bar empty, so
    // everything else is applied in place.
    const previous = this.cfg.statusBar;
    const recreate =
      !this.item ||
      cfg.statusBar.alignment !== previous.alignment ||
      cfg.statusBar.priority !== previous.priority;
    // An explicit setting wins over a previous cycle, otherwise changing the
    // metric in settings would silently do nothing for the rest of the session.
    const metricChanged = cfg.statusBar.metric !== previous.metric;
    this.cfg = cfg;
    if (metricChanged) { this.metricOverride = undefined; }
    if (recreate) { this.build(); } else { this.apply(); }
    this.render();
  }

  update(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    this.render();
  }

  setScanning(): void {
    if (!this.item || this.spinner) { return; }
    this.spinner = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER.length;
      if (this.item && !this.snapshot) {
        this.item.text = `${SPINNER[this.spinnerFrame]} scanning transcripts…`;
      }
    }, 120);
    this.item.text = `${SPINNER[0]} scanning transcripts…`;
    this.item.tooltip = 'Reading Claude Code transcripts…';
  }

  private stopSpinner(): void {
    if (this.spinner) { clearInterval(this.spinner); this.spinner = undefined; }
  }

  render(): void {
    const item = this.item;
    const snap = this.snapshot;
    if (!item) { return; }
    if (!this.cfg.statusBar.enabled) { item.hide(); return; }
    item.show();
    if (!snap) { return; }
    this.stopSpinner();

    const sb = this.cfg.statusBar;
    const view = this.view(snap);

    if (snap.eventCount === 0 && !view.hasPercent) {
      item.text = '▫ no usage data';
      item.tooltip = 'No Claude Code activity found yet.';
      item.backgroundColor = undefined;
      item.color = undefined;
      return;
    }

    const parts: string[] = [];
    if (sb.showIcon) { parts.push('$(robot)'); }
    if (sb.showMeter && view.hasPercent) {
      parts.push(meter(view.percent, sb.meterWidth, sb.meterStyle, snap.burnSeries));
    }
    if (sb.showPercent && view.hasPercent) { parts.push(formatPercent(view.percent, view.estimated)); }
    if (sb.showTokens || !view.hasPercent) { parts.push(formatTokens(view.totals.counted)); }
    if (sb.showCost && snap.costEnabled) {
      parts.push(`${this.cfg.cost.currencySymbol}${view.totals.cost.toFixed(2)}`);
    }
    if (sb.showReset && view.resets) {
      parts.push(`· ${formatDuration(view.remainingMs)}`);
    }
    // An empty string renders as no item at all, so never emit one.
    item.text = parts.join(' ').trim() || formatTokens(view.totals.counted);
    item.tooltip = this.tooltip(snap);

    const danger = view.percent >= sb.dangerThreshold;
    const warn = view.percent >= sb.warnThreshold;
    if (!sb.useColors || !view.hasPercent) {
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

  private view(snap: Snapshot): { totals: Totals; percent: number; limit: number; hasPercent: boolean; estimated: boolean; remainingMs: number; resets: boolean; label: string } {
    switch (this.metric) {
      case 'week':
        return { ...window(snap.week), resets: snap.week.hasPercent || this.cfg.weeklyMode === 'calendar', label: 'Week' };
      case 'today':
        return { totals: snap.today, percent: 0, limit: 0, hasPercent: false, estimated: false, remainingMs: 0, resets: false, label: 'Today' };
      case 'session': {
        const totals = snap.session?.totals;
        return {
          totals: totals ?? snap.today,
          percent: 0, limit: 0, hasPercent: false, estimated: false, remainingMs: 0, resets: false,
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
      `**${label}** ` +
      (w.hasPercent ? `${meter(w.percent, 10, this.cfg.statusBar.meterStyle, snap.burnSeries)} ${w.estimated ? '~' : ''}${Math.round(w.percent)}% · ` : '') +
      `${formatTokens(w.totals.counted)} tok` +
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
    if (snap.source === 'transcripts' && snap.block.estimated) {
      md.appendMarkdown('---\n\n$(info) Estimated against a plan ceiling. Connect your account for Claude\'s own figures.\n\n');
    } else if (snap.source === 'transcripts') {
      md.appendMarkdown('---\n\n$(info) Percentages need your Claude sign-in. Open the dashboard to connect or diagnose.\n\n');
    }
    md.appendMarkdown('---\n\n$(graph) Click to open the dashboard');
    return md;
  }

  dispose(): void {
    this.stopSpinner();
    this.item?.dispose();
  }
}

function window(w: Window): { totals: Totals; percent: number; limit: number; hasPercent: boolean; estimated: boolean; remainingMs: number } {
  return {
    totals: w.totals, percent: w.percent, limit: w.limit,
    hasPercent: w.hasPercent, estimated: w.estimated, remainingMs: w.remainingMs
  };
}
