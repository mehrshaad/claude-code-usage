import * as vscode from 'vscode';

export type ControlKind =
  | 'toggle' | 'dropdown' | 'stepper' | 'slider' | 'text'
  | 'path' | 'colour' | 'list' | 'pricing'
  | 'meterStyle' | 'meterWidth' | 'gaugeStyle' | 'numberFont';

export interface SettingSpec {
  /** Key without the `claudeUsage.` prefix. */
  key: string;
  section: string;
  label: string;
  help?: string;
  kind: ControlKind;
  options?: { value: string; label: string; note?: string }[];
  min?: number;
  max?: number;
  /** Parent key that must be truthy (or equal `parentValue`) for this to apply. */
  parent?: string;
  parentValue?: string;
  /** Inert only when the parent equals this value - for "applies unless" cases. */
  parentNot?: string;
  /**
   * Inert because of runtime state rather than another setting:
   * `account` - the account reports the real numbers, so this is ignored
   * `noPercent` - there is no percentage at all, so this changes nothing
   * `costOff`  - cost display is off, so this has nothing to show
   */
  dimIf?: 'account' | 'noPercent' | 'costOff';
  /** Indent level, 1 = nested, 2 = nested under a nested parent. */
  depth?: number;
}

export const SECTIONS = [
  { id: 'source', label: 'Source of the numbers' },
  { id: 'statusBar', label: 'Status bar' },
  { id: 'counting', label: 'Counting rules' },
  { id: 'cost', label: 'Cost' },
  { id: 'panel', label: 'Panel' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'notifications', label: 'Notifications' }
];

const onOff = (labels: [string, string]) => [
  { value: labels[0], label: labels[0] },
  { value: labels[1], label: labels[1] }
];

export const SETTINGS: SettingSpec[] = [
  // Source of the numbers
  { key: 'source', section: 'source', label: 'Percentages from', kind: 'dropdown', options: [
    { value: 'auto', label: 'Account, else local' },
    { value: 'account', label: 'Account only' },
    { value: 'transcripts', label: 'Local transcripts only' }
  ], help: 'Limit percentages are computed by Claude and can only be read from your account.' },
  { key: 'apiPollSeconds', section: 'source', label: 'Refresh limits every', kind: 'stepper', min: 15, max: 3600, help: 'seconds', parent: 'source', parentNot: 'transcripts', depth: 1 },
  // Fallback ceilings: they apply under `transcripts`, and under `auto` whenever
  // the account is unreachable. Only `account` makes them genuinely inert.
  { key: 'plan', section: 'source', label: 'Plan (estimate)', kind: 'dropdown', dimIf: 'account', options: [
    { value: 'auto', label: 'Calibrate from my history' }, { value: 'pro', label: 'Pro' },
    { value: 'max5', label: 'Max 5x' }, { value: 'max20', label: 'Max 20x' }, { value: 'none', label: 'No estimate' }
  ], help: 'used only until your account is connected' },
  { key: 'blockTokenLimit', section: 'source', label: 'Block token limit', kind: 'stepper', min: 0, max: 100_000_000_000, dimIf: 'account', depth: 1, help: '0 = from plan' },
  { key: 'weeklyTokenLimit', section: 'source', label: 'Weekly token limit', kind: 'stepper', min: 0, max: 100_000_000_000, dimIf: 'account', depth: 1, help: '0 = from plan' },
  { key: 'blockHours', section: 'source', label: 'Block length', kind: 'stepper', min: 1, max: 24, help: 'hours', dimIf: 'account' },
  { key: 'weeklyMode', section: 'source', label: 'Weekly window', kind: 'dropdown', options: [
    { value: 'rolling7d', label: 'Rolling 7 days' }, { value: 'calendar', label: 'Calendar week' }
  ] },
  { key: 'weekStartsOn', section: 'source', label: 'Week starts on', kind: 'dropdown', options: onOff(['monday', 'sunday']), parent: 'weeklyMode', parentValue: 'calendar', depth: 1 },

  // Status bar
  { key: 'statusBar.enabled', section: 'statusBar', label: 'Show in status bar', kind: 'toggle' },
  { key: 'statusBar.metric', section: 'statusBar', label: 'Metric', kind: 'dropdown', parent: 'statusBar.enabled', depth: 1, options: [
    { value: 'block', label: 'Session' }, { value: 'week', label: 'Week' },
    { value: 'today', label: 'Today' }, { value: 'session', label: 'Active session' }
  ] },
  { key: 'statusBar.showMeter', section: 'statusBar', label: 'Show meter', kind: 'toggle', parent: 'statusBar.enabled', depth: 1, dimIf: 'noPercent' },
  { key: 'statusBar.meterStyle', section: 'statusBar', label: 'Meter style', kind: 'meterStyle', parent: 'statusBar.showMeter', depth: 2, dimIf: 'noPercent' },
  { key: 'statusBar.meterWidth', section: 'statusBar', label: 'Meter width', kind: 'meterWidth', min: 4, max: 30, parent: 'statusBar.showMeter', depth: 2, dimIf: 'noPercent' },
  { key: 'statusBar.showPercent', section: 'statusBar', label: 'Show percent', kind: 'toggle', parent: 'statusBar.enabled', depth: 1, dimIf: 'noPercent' },
  { key: 'statusBar.showReset', section: 'statusBar', label: 'Show reset countdown', kind: 'toggle', parent: 'statusBar.enabled', depth: 1 },
  { key: 'statusBar.showTokens', section: 'statusBar', label: 'Show tokens', kind: 'toggle', parent: 'statusBar.enabled', depth: 1 },
  { key: 'statusBar.showCost', section: 'statusBar', label: 'Show cost', kind: 'toggle', parent: 'statusBar.enabled', depth: 1, dimIf: 'costOff' },
  { key: 'statusBar.showIcon', section: 'statusBar', label: 'Show icon', kind: 'toggle', parent: 'statusBar.enabled', depth: 1 },
  { key: 'statusBar.useColors', section: 'statusBar', label: 'Colour at thresholds', kind: 'toggle', parent: 'statusBar.enabled', depth: 1, dimIf: 'noPercent' },
  { key: 'statusBar.warnThreshold', section: 'statusBar', label: 'Warning at', kind: 'slider', min: 1, max: 100, parent: 'statusBar.enabled', depth: 1, help: '%', dimIf: 'noPercent' },
  { key: 'statusBar.dangerThreshold', section: 'statusBar', label: 'Danger at', kind: 'slider', min: 1, max: 100, parent: 'statusBar.enabled', depth: 1, help: '%', dimIf: 'noPercent' },
  { key: 'statusBar.clickAction', section: 'statusBar', label: 'Click does', kind: 'dropdown', parent: 'statusBar.enabled', depth: 1, options: [
    { value: 'openDashboard', label: 'Open dashboard' }, { value: 'cycleMetric', label: 'Cycle metric' },
    { value: 'refresh', label: 'Refresh' }, { value: 'none', label: 'Nothing' }
  ] },
  { key: 'statusBar.alignment', section: 'statusBar', label: 'Side', kind: 'dropdown', parent: 'statusBar.enabled', depth: 1, options: onOff(['right', 'left']) },
  { key: 'statusBar.priority', section: 'statusBar', label: 'Priority', kind: 'stepper', min: -1000, max: 1000, parent: 'statusBar.enabled', depth: 1, help: 'higher sits further left' },

  // Counting rules
  { key: 'countInput', section: 'counting', label: 'Count input tokens', kind: 'toggle' },
  { key: 'countOutput', section: 'counting', label: 'Count output tokens', kind: 'toggle' },
  { key: 'countCacheWrites', section: 'counting', label: 'Count cache writes', kind: 'toggle' },
  { key: 'countCacheReads', section: 'counting', label: 'Count cache reads', kind: 'toggle', help: 'these dominate every total' },
  { key: 'includeSubagents', section: 'counting', label: 'Include subagents', kind: 'toggle' },
  { key: 'projectFilter', section: 'counting', label: 'Count', kind: 'dropdown', options: [
    { value: 'all', label: 'All projects' }, { value: 'currentWorkspace', label: 'This workspace only' }
  ] },
  { key: 'lookbackDays', section: 'counting', label: 'History loaded', kind: 'stepper', min: 1, max: 365, help: 'days' },

  // Cost
  { key: 'cost.enabled', section: 'cost', label: 'Show cost', kind: 'toggle' },
  { key: 'cost.currencySymbol', section: 'cost', label: 'Currency symbol', kind: 'text', parent: 'cost.enabled', depth: 1 },
  { key: 'cost.pricing', section: 'cost', label: 'Per-model rates', kind: 'pricing', parent: 'cost.enabled', depth: 1 },

  // Panel
  { key: 'dashboard.gaugeStyle', section: 'panel', label: 'Session gauge', kind: 'gaugeStyle' },
  { key: 'dashboard.numberFont', section: 'panel', label: 'Numbers use', kind: 'numberFont' },
  { key: 'dashboard.accentColor', section: 'panel', label: 'Accent', kind: 'colour' },
  { key: 'dashboard.defaultRange', section: 'panel', label: 'Opens showing', kind: 'dropdown', options: [
    { value: 'block', label: 'Session' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' }, { value: 'all', label: 'All' }
  ] },
  { key: 'dashboard.showModels', section: 'panel', label: 'Show model table', kind: 'toggle' },
  { key: 'dashboard.showSessions', section: 'panel', label: 'Show sessions', kind: 'toggle' },
  { key: 'dashboard.maxSessions', section: 'panel', label: 'Sessions listed', kind: 'stepper', min: 1, max: 50, parent: 'dashboard.showSessions', depth: 1 },
  { key: 'dashboard.showHistory', section: 'panel', label: 'Show 30-day history', kind: 'toggle' },

  // Runtime
  { key: 'refreshIntervalMs', section: 'runtime', label: 'Poll every', kind: 'stepper', min: 500, max: 600_000, help: 'milliseconds' },
  { key: 'watchFiles', section: 'runtime', label: 'Watch for writes', kind: 'toggle', help: 'refresh the moment Claude Code writes' },
  { key: 'claudeDir', section: 'runtime', label: 'Claude data directory', kind: 'path' },

  // Notifications
  { key: 'notifications.enabled', section: 'notifications', label: 'Warn at thresholds', kind: 'toggle', dimIf: 'noPercent', help: 'needs a percentage to warn against' },
  { key: 'notifications.thresholds', section: 'notifications', label: 'Thresholds', kind: 'list', parent: 'notifications.enabled', depth: 1 }
];

export interface SettingState {
  key: string;
  value: unknown;
  default: unknown;
  /** True when the user has set it anywhere (global or workspace). */
  changed: boolean;
  /** True when a workspace value is in force - the panel cannot own that value. */
  external: boolean;
  externalLabel?: string;
}

export function readState(): SettingState[] {
  const config = vscode.workspace.getConfiguration('claudeUsage');
  return SETTINGS.map((spec) => {
    const info = config.inspect(spec.key);
    const workspace = info?.workspaceValue ?? info?.workspaceFolderValue;
    const global = info?.globalValue;
    return {
      key: spec.key,
      value: config.get(spec.key),
      default: info?.defaultValue,
      changed: global !== undefined || workspace !== undefined,
      external: workspace !== undefined,
      externalLabel: workspace !== undefined ? '.vscode/settings.json' : undefined
    };
  });
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  await vscode.workspace
    .getConfiguration('claudeUsage')
    .update(key, value, vscode.ConfigurationTarget.Global);
}

export async function resetSetting(key: string): Promise<void> {
  await writeSetting(key, undefined);
}
